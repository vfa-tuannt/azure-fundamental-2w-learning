## Context

Phase 3 introduced the `enrollments` table with the `in_progress | submitted | approved | rejected` enum. Two of those values (`submitted`, `approved`, `rejected`) were declared but never produced — they exist only as a guard on the withdraw endpoint. Phase 4 introduces the **only** write path that flips an enrollment to `submitted`: a successful submission.

The PRD (US-010, US-011) constrains the shape:
- `submissions(id, enrollment_id FK, blob_url NULL, external_url NULL, notes text, submitted_at)` — exactly one of `blob_url` / `external_url` set
- `POST /enrollments/:id/submissions` accepts multipart (file) **or** JSON (`{ externalUrl, notes }`)
- Files go to Azurite container `submissions/{userId}/{enrollmentId}/{filename}`
- MIME whitelist (`PDF`, `PNG`, `JPG`, `ZIP`, `Markdown`), max 25 MB; **422** otherwise
- Successful submit flips `enrollment.status` to `submitted`
- `GET /enrollments/:id/submissions` lists the enrollment's submissions
- FE: a "Submit Output" panel visible to enrolled (`in_progress`) users on the challenge detail, file vs URL toggle, submission list, error Toast

Inherited platform constraints (CLAUDE.md):
- Service-layer ownership/business rules — controllers are one-line shims
- Global `ValidationPipe` already configured (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`)
- camelCase TypeScript ↔ snake_case columns via `@Column({ name: '...' })`
- Soft-delete via `@DeleteDateColumn`. `submissions` table has no `deleted_at` — submissions are permanent records of work delivered (matches `enrollments`)
- Local infra: Azurite is already wired in `docker-compose.yml` on ports 10000–10002 and accepts the magic connection string `UseDevelopmentStorage=true`

## Goals / Non-Goals

**Goals:**
- An enrolled member with `status = in_progress` can submit either a file (≤ 25 MB, whitelisted MIME) or an external URL with optional notes, in one round-trip
- The submission lands in Azurite under a deterministic key the FE can show ("filename.pdf") and the future blob-trigger Function can scan
- The enrollment transitions to `submitted` atomically with the submission insert (one DB transaction) so a successful HTTP 201 implies both rows are consistent
- The challenge detail page re-renders without a page reload: the Submit panel disappears, the button matrix from Phase 3 swaps to `terminal-submitted`, and the new submission shows up in the list below
- The challenge owner can read submissions for any enrollment of their challenge (needed for Phase 5 review without re-shipping the API)
- Phase 7's switch to Azure Blob Storage is a connection-string change in the env — no service or controller code changes

**Non-Goals:**
- No approve / reject — that is Phase 5
- No `GET /challenges/:id/submissions` (all enrollments for a challenge) — that is Phase 5's owner review surface
- No activity events on submit — that is Phase 6
- No edit / delete of submissions (PRD says nothing about it; submissions are immutable records). A user who wants to re-submit must wait for Phase 5's reject + re-enroll flow
- No thumbnail generation — that is Phase 7c's Container App
- No virus / content scanning — that is Phase 7b's blob-trigger Function
- No SAS token URLs or pre-signed download links — submissions in Azurite are served as the raw `blob_url` (Azurite returns it on the local network); Phase 7 will add SAS generation
- No streaming uploads — we buffer the whole file in memory (multer default). The 25 MB cap × handful of concurrent users keeps backend RAM under control
- No paginated `GET /enrollments/:id/submissions` — the same reasoning as `/me/enrollments` (small N)
- No revoke / withdraw after submit — the enrollment is no longer in `in_progress`, so the existing Phase 3 withdraw endpoint already returns 409. Users get unstuck only via Phase 5 reject

## Decisions

**D1 — `submissions` is a separate table with a CHECK XOR constraint between `blob_url` and `external_url`**
Two nullable columns with a CHECK that exactly one is non-null (`(blob_url IS NULL) <> (external_url IS NULL)`). The alternative — a discriminator column (`kind: 'file' | 'url'`) plus a single content column — collapses the two into a typed-union but loses the natural read shape (the FE wants `blobUrl` or `externalUrl` directly). The CHECK guards against the application accidentally writing both.

Rationale: matches PRD §8 verbatim; DB-enforced correctness. Alternative (single `content` column) needs application-side parsing on every read.

**D2 — Successful submit flips `enrollment.status` to `submitted` inside the same DB transaction as the insert**
The `POST /enrollments/:id/submissions` service method opens a single transaction that:
1. SELECT FOR UPDATE the enrollment row (locks against a concurrent withdraw)
2. Validates `enrollment.user_id === jwt.sub` (403), `enrollment.status === 'in_progress'` (409)
3. INSERT the submission row
4. UPDATE the enrollment to `submitted`
5. COMMIT

The blob upload runs **outside** the transaction, **before** step 1, so the transaction is short and never blocks on network I/O. If the DB transaction fails after a successful upload we end up with an orphan blob — see Risks below.

Rationale: keeps DB locks short; the orphan-blob risk is acceptable for an internal platform and will be cleaned by the Phase 7b blob-trigger Function.

**D3 — Object-key convention is `{userId}/{enrollmentId}/{uuid}-{sanitizedFilename}`**
The PRD says `submissions/{userId}/{enrollmentId}/{filename}`. We add a uuid prefix to the filename so that:
- A user re-submitting the same filename doesn't overwrite a prior blob (filenames are not unique within an enrollment over time)
- The `{userId}/{enrollmentId}/...` prefix keeps Storage listings cheap when scoped to one enrollment
- The sanitiser strips path separators (`/`, `\`), control characters, and limits length to 100 characters — a basic safety net against blob-name injection

`blob_url` is then `${containerEndpoint}/submissions/{objectKey}`. The full URL is what the FE renders for the download link.

Rationale: deterministic enough to debug, unique enough to avoid collisions, safe against path traversal in the Azure SDK.

**D4 — MIME whitelist is enforced in the service layer, after multer parses the buffer**
PrimeVue's `FileUpload` accepts an `accept` attribute that filters in the file picker, but it is trivially bypassed (drag-drop, browser dev tools). The authoritative MIME check lives in the service. We read `file.mimetype` (multer sets it from the `Content-Type` of the multipart part) AND sniff the first few bytes for the binary types (PDF: `%PDF`, PNG: `\x89PNG`, JPEG: `\xFF\xD8\xFF`, ZIP: `PK\x03\x04`) so a renamed `.exe` cannot ride in as `application/pdf`. Markdown is text and trusted from `mimetype` alone (`text/markdown`); the editor field will be a re-uploadable `.md` file. 422 on mismatch with a body `{ message, allowed: ['application/pdf', ...] }`.

Rationale: defence-in-depth without a third-party MIME-detection library. Alternative (full content-type sniffing via `file-type` package) is heavier and not needed for an internal platform.

**D5 — File size limit is enforced by multer's `limits.fileSize`, plus a fallback check in the service**
We configure `FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } })`. Multer aborts the parse and emits a `LIMIT_FILE_SIZE` error that we translate to 422. As a fallback (e.g., multer misconfiguration), the service also rejects `file.size > MAX_BYTES` so the rule is enforced even if the interceptor is bypassed.

Rationale: 25 MB is the PRD-mandated cap; defending it at two layers is cheap.

**D6 — `AzureBlobStorageService` is a typed wrapper around `BlobServiceClient`, lazy-init container on first use**
The service reads `AZURE_STORAGE_CONNECTION_STRING` (`UseDevelopmentStorage=true` locally) and `AZURE_STORAGE_SUBMISSIONS_CONTAINER` (`submissions` locally). On first `upload(...)` call it calls `containerClient.createIfNotExists({ access: 'blob' })` so the container is auto-created the first time the backend boots against a fresh Azurite. The `access: 'blob'` setting makes individual blobs publicly readable by URL — fine for an internal demo platform; Phase 7 will switch to private + SAS URLs.

The public API is exactly two methods: `upload(buffer: Buffer, contentType: string, objectKey: string): Promise<{ blobUrl: string }>` and `delete(objectKey: string): Promise<void>` (used by the future sweeper, declared now so we never have to revisit the service). No `download` method — the FE links directly to the blob URL.

Rationale: a thin facade keeps the Azure SDK out of the controllers and out of the service unit tests (we mock the facade).

**D7 — Authorization rules in the service layer**
| Endpoint | Allowed | 403 otherwise |
|---|---|---|
| `POST /enrollments/:id/submissions` | enrollment owner (caller is `enrollment.user_id`) | always — challenge owner cannot submit *to* an enrollment |
| `GET /enrollments/:id/submissions` | enrollment owner OR challenge owner of `enrollment.challenge_id` | everyone else |
| `GET /submissions/:id` | enrollment owner OR challenge owner | everyone else |

Service-layer check joins `enrollments` with `challenges` to fetch `owner_id` in one query. The same join powers the Phase 5 review endpoints, so we factor it into a helper `getSubmissionContext(submissionId)` that returns `{ submission, enrollment, challenge }`.

Rationale: keeps the controller a one-line shim; the join is what we'd do anyway.

**D8 — Submission DTO shape**
`{ id (uuid), enrollmentId (uuid), blobUrl (string|null), externalUrl (string|null), notes (string), submittedAt (ISO 8601 string) }`. Exactly one of `blobUrl` / `externalUrl` is non-null per the CHECK constraint. We do NOT include the original filename as a separate field — it is the suffix of `blobUrl` after the last `/`, and the FE parses it cheaply when rendering.

Rationale: minimal shape; the FE never needs the raw object key, just the URL.

**D9 — `submitted_at` is `@CreateDateColumn`**
Mirrors `enrollments.enrolled_at`. The service does not set it explicitly; the column default + TypeORM populate it.

**D10 — `notes` defaults to empty string, not null**
A file-upload submission may have no notes; a URL submission usually does. Defaulting to `''` (not `null`) means the FE renders `submission.notes` without a null-check.

Rationale: tiny ergonomic win; matches Vue's idiom of binding empty strings to inputs.

**D11 — FE Submit Output panel is rendered conditionally on `myEnrollment.status === 'in_progress'`**
The Phase 3 button matrix already covers every other state. The panel sits **below** the markdown description and **above** the existing button toolbar, so the visual order is: header → description → submit panel → button row → submissions list. When the panel disappears (submit success), the button matrix's `withdraw-enabled` state automatically swaps to `terminal-submitted` because the store mutates `myEnrollment.status`.

**D12 — File vs URL toggle is a PrimeVue `SelectButton` with two values**
Two big buttons "File" and "External URL", default to "File". Each mode mounts a different form sub-tree (`v-if`):
- File mode: `FileUpload` with `customUpload`, `:auto="false"` (we trigger upload manually), `accept=".pdf,.png,.jpg,.jpeg,.zip,.md"`, `:maxFileSize="25 * 1024 * 1024"`. The user picks the file, sees it staged, then clicks our Submit button (not the FileUpload's built-in Upload button — we hide it via `:show-upload-button="false"`)
- URL mode: `InputText` for the URL (`type="url"`, validated client-side via `URL` constructor), `Textarea` for notes (`rows="3"`, optional)

Plus a shared `Textarea` for **notes** in both modes — required in URL mode, optional in File mode.

Rationale: clean separation of the two input modes without a confusing combined form. Alternative (one form with both fields, only one filled) is harder to validate.

**D13 — On submit success, the FE updates three local pieces of state**
1. `enrollments.byChallengeId[challengeId].status = 'submitted'` (so the button matrix swaps without a re-fetch)
2. `submissions.byEnrollmentId[enrollmentId].unshift(newSubmission)` (so the list shows the new row instantly)
3. Reset the form fields and dismiss the panel

No optimistic UI — we wait for the 201 response. PRD does not require optimistic and the failure modes (422, 409) are too important to gloss over.

**D14 — Submissions list per enrollment uses a Pinia store keyed by `enrollmentId`**
`submissionsStore.byEnrollmentId: Map<string, Submission[]>`. The challenge detail view calls `submissionsStore.loadForEnrollment(enrollmentId)` on mount when the caller is enrolled. The store handles "not yet loaded" vs "loaded but empty" via the Map presence (`.has(key)` vs `.get(key)?.length === 0`).

Rationale: aligns with Phase 3's `enrollmentsStore` shape; trivially extends to Phase 5's review screen.

**D15 — The 25 MB limit and MIME list are documented in two places only: the backend service constant and the FE `FileUpload` props**
We do **not** introduce a shared constants file across BE and FE. The values are stable, the duplication is two lines, and the FE constraints are user-facing hints — the BE is the authority. If the values change we accept the two-file edit.

Rationale: avoid a shared types/constants package for two integers and one array.

**D16 — `notes` is part of the JSON body for URL submissions, and a *form field* for file submissions**
Multipart bodies cannot reuse the JSON body. We send `notes` as a multipart text field alongside the `file` field; multer parses it onto `req.body.notes`. The DTO uses a single `CreateSubmissionDto` with `@IsOptional() notes?: string` and a custom validator that accepts either `{ file: UploadedFile, notes? }` or `{ externalUrl: string, notes? }`.

Rationale: standard multer pattern; one DTO for both modes.

**D17 — Orphan blob handling: log and continue**
If the DB transaction fails *after* a blob upload succeeds, the blob sits in Azurite forever. For Phase 4 we log the orphan object key at `error` level (`AzureBlobStorageService.upload` returns the key; the service catches the transaction error, logs `Orphan blob created during failed submission: {key}`, then rethrows). Phase 7b's blob-trigger Function will list submissions older than N hours that have no DB row and delete them.

Rationale: pragmatic; the alternative (compensating delete in `catch`) doubles the failure surface (what if the delete also fails?) for an internal platform with cheap storage.

## Risks / Trade-offs

- [Orphan blobs on failed DB commit] → Mitigation: D17 (log + Phase 7b sweeper). Acceptable storage cost for Azurite (free, local) and prod (cents).
- [25 MB buffer in memory per concurrent upload] → Mitigation: small N of concurrent users on an internal platform; the App Service B1 plan in Phase 7 has 1.75 GB RAM, which easily absorbs a few concurrent 25 MB uploads. If we ever hit the limit we can switch to multer's `diskStorage` or stream directly to `BlockBlobClient.uploadStream`.
- [MIME spoofing (rename `evil.exe` to `safe.pdf`)] → Mitigation: D4's magic-byte sniff for binary types. Markdown is text and is whitelisted regardless of content — the worst case is a malformed `.md` file, which is harmless. We do **not** scan for viruses (Phase 7b's Function will).
- [File name injection / path traversal] → Mitigation: D3's sanitizer + the Azure SDK's blob naming rules (the SDK rejects names containing `..`, control chars, etc.). The uuid prefix means even a bypassed sanitiser cannot collide with another user's blob.
- [`blob_url` is public-readable in Azurite + Phase 4] → Mitigation: this is acceptable for an internal-only Vitalify platform behind login (the URL is only exposed to authenticated users via the JSON response). Phase 7 will switch to private blobs + SAS tokens before going on the public internet.
- [Multipart `notes` is sent as a string and the DTO's `class-validator` decorators run on the parsed object] → Mitigation: standard NestJS behavior — `FileInterceptor` populates `req.body` *and* `req.file`; `ValidationPipe` validates `req.body` against the DTO. The DTO has `@IsOptional() @IsString() notes?: string`, which works for both modes.
- [The `in_progress → submitted` transition is owned by `backend-submissions`, but `enrollment.status` lives in the enrollments table] → Mitigation: we explicitly state this ownership in the spec. The submissions service is the only code path that writes `submitted`; the enrollments service is the only code path that writes `in_progress` (on enroll). Phase 5 will own the writes to `approved` and `rejected`. This stays clean as long as we resist the temptation to expose a generic `PATCH /enrollments/:id` endpoint.

## Migration Plan

1. Generate a TypeORM migration `CreateSubmissionsTable` that:
   - creates the `submissions` table with the columns from the proposal
   - adds FK `submissions.enrollment_id → enrollments.id` (`ON DELETE RESTRICT`)
   - adds CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)`
   - adds index on `(enrollment_id, submitted_at DESC)`
2. **Review the generated SQL by hand** before commit: TypeORM tends to omit `DESC` on composite indexes and may skip the CHECK constraint entirely (it does not currently generate CHECK from decorators reliably). Add both manually.
3. Run `yarn migration:run` against local Postgres; verify in pgAdmin (`\d submissions`).
4. Add `@azure/storage-blob` to `backend/package.json`: `yarn add @azure/storage-blob`.
5. Update `backend/.env` and `backend/.env.example`:
   ```
   AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
   AZURE_STORAGE_SUBMISSIONS_CONTAINER=submissions
   ```
6. Verify Azurite is running: `docker compose up -d azurite`; the service will lazy-create the `submissions` container on first upload.
7. **Rollback**: `yarn migration:revert` drops the index, the FK, the table. No enum to drop (the `enrollment_status` enum is unchanged). Blob data in Azurite is local-only and can be wiped by removing the volume.
8. Deploy is local-only in Phase 4 — no Azure migration. Phase 7 will swap the connection string to the real Storage Account.

## Open Questions

None. All PRD ambiguities are resolved in Decisions:
- D2 picks "transactional state flip outside blob upload"
- D4 picks "MIME mimetype check + magic-byte sniff" over a third-party library
- D7 picks "challenge owner can read submissions" (Phase 5 forward-compat)
- D8 omits a separate filename field
- D12 picks `SelectButton` toggle for the FE input mode
- D17 picks log-and-continue for orphan blobs

Phase 5 (review) will add `GET /challenges/:id/submissions` and the approve/reject endpoints; the helper `getSubmissionContext` introduced in D7 is the single read path it will reuse.
