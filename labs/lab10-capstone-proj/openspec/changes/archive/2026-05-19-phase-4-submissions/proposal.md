## Why

Phase 3 lets members enroll in a challenge, but there is no way to actually deliver the work — the enrollment lifecycle just dead-ends at `in_progress`. Phase 4 closes that gap by letting an enrolled member upload their output (either a binary file or an external URL) and automatically flipping the enrollment to `submitted` so Phase 5 (owner review) has something to act on. It also wires the backend to **Azurite** (the local Azure Blob Storage emulator already running in `docker-compose.yml`), so Phase 7's move to real Azure Blob Storage will be a connection-string swap rather than a rewrite.

## What Changes

- Add a `submissions` table (`id uuid PK`, `enrollment_id uuid FK enrollments`, `blob_url text NULL`, `external_url text NULL`, `notes text NOT NULL DEFAULT ''`, `submitted_at timestamptz default now()`) with a TypeORM migration; check constraint `(blob_url IS NOT NULL) <> (external_url IS NOT NULL)` so exactly one of the two is set; FK `ON DELETE RESTRICT`; index `(enrollment_id, submitted_at DESC)`
- Add a TypeORM `Submission` entity and a `SubmissionsModule` (controller + service + DTOs)
- Add backend endpoints (all `@UseGuards(JwtAuthGuard)`):
  - `POST /enrollments/:id/submissions` — multipart (`file` field) OR JSON (`{ externalUrl, notes? }`); creates one submission row, uploads the file to Azurite, and flips the enrollment to `submitted` in the same transaction; returns **201** with the submission DTO. Returns **422** for disallowed MIME type or file > 25 MB, **400** if both file and externalUrl are missing or both are present, **404** if the enrollment does not exist, **403** if the caller is not the enrollment owner, **409** if the enrollment status is not `in_progress`
  - `GET /enrollments/:id/submissions` — returns submissions for the enrollment ordered `submitted_at DESC`; visible to the enrollment owner (`user_id == JWT sub`) and to the challenge owner; everyone else gets **403**; **404** if the enrollment is missing
  - `GET /submissions/:id` — returns a single submission DTO; visible to the enrollment owner and the challenge owner; **403** / **404** otherwise
- Add a typed `AzureBlobStorageService` wrapping `@azure/storage-blob`: reads `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_SUBMISSIONS_CONTAINER` from env, lazily creates the `submissions` container on boot, and exposes `upload(buffer, contentType, objectKey) → blobUrl`
- Define the object-key convention as `{userId}/{enrollmentId}/{uuid}-{sanitizedFilename}` and the MIME whitelist as `application/pdf, image/png, image/jpeg, application/zip, text/markdown` (limit 25 MB). Reject everything else with HTTP 422 and a structured `{ message, allowed }` body
- Add `@azure/storage-blob` to backend dependencies; reuse the bundled `multer` from `@nestjs/platform-express` via `FileInterceptor` for parsing multipart bodies
- Add a typed `submissionsApi` client at `frontend/src/api/submissions.ts` with `create(enrollmentId, { file } | { externalUrl, notes })`, `listForEnrollment(enrollmentId)`, `getById(submissionId)`
- Add a Pinia `submissionsStore` (`Map<enrollmentId, Submission[]>`, `loading`, `error`) so the detail page and the future review page (Phase 5) share state
- Update `frontend/src/views/ChallengeDetailView.vue`: when the caller is enrolled with `status === 'in_progress'`, render a **"Submit Output"** panel below the existing description containing
  - a mode toggle: **File** (PrimeVue `FileUpload` with `customUpload`, drag-drop, single file, accept restricted to the MIME whitelist, max 25 MB shown via the component's built-in messaging) or **External URL** (PrimeVue `InputText` for the URL + `Textarea` for notes)
  - a **Submit** button that calls `submissionsApi.create(...)`, then on success: shows a Toast, removes the panel, sets `myEnrollment.status = 'submitted'` (so the existing button matrix from Phase 3 swaps to the `terminal-submitted` state without a page reload), and appends the new submission to the local submissions list
- Update the same view to render a **"My Submissions"** list (latest first) beneath the panel when the caller has any submissions for the current challenge — a `<ul>` with each entry showing the file name (parsed from `blobUrl`) or the external URL, the notes, and a relative `submittedAt`
- Update `.env.example` to document `AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true` and `AZURE_STORAGE_SUBMISSIONS_CONTAINER=submissions`
- Update `frontend/src/api/types.ts` with `Submission` and the discriminated-union request shape used by the create endpoint

## Capabilities

### New Capabilities
- `backend-submissions`: Submission entity and table, the three submission endpoints, Azurite blob upload behavior, MIME/size validation, the `in_progress → submitted` state transition that the submit endpoint owns, authorization rules (enrollment owner OR challenge owner), submission DTO shape
- `frontend-submissions`: Submission API client, Pinia store, the Submit Output panel + My Submissions list on the challenge detail view, file vs. external-URL toggle, error Toast for 422 (too large / wrong type) and 409 (already submitted)

### Modified Capabilities

No existing capabilities have their requirements changed in this phase. The `submitted` enrollment status was already reserved in Phase 3 (the withdraw endpoint explicitly blocks withdraw when status is `submitted`); Phase 4 simply introduces the only write path that produces that status, and that path is owned by the new `backend-submissions` capability.

## Impact

- **Backend**: new `SubmissionsModule` (controller + service + DTOs), new `Submission` entity, new `AzureBlobStorageService`, new TypeORM migration creating the `submissions` table with the FK to `enrollments.id` (`ON DELETE RESTRICT`), the XOR check constraint on `(blob_url, external_url)`, and the `(enrollment_id, submitted_at DESC)` index. The submit endpoint wraps "insert submission row + update enrollment status" in a single transaction; blob upload runs **before** the transaction so a DB failure leaves an orphan blob (acceptable — Phase 7 will add a sweeper Function, Phase 4 just logs the orphan key)
- **Frontend**: new files `src/api/submissions.ts`, `src/stores/submissions.ts`; surgical edits to `src/views/ChallengeDetailView.vue` and `src/api/types.ts`; no new dependencies (PrimeVue `FileUpload` and `Textarea` ship with the existing PrimeVue install)
- **Dependencies (backend)**: add `@azure/storage-blob` (Azure SDK; works against both Azurite and real Blob Storage with no code change). No new frontend dependencies
- **Database**: new `submissions` table; no changes to `enrollments`, `challenges`, or `users` table shape; the existing `enrollment_status` enum is unchanged (Phase 3 already declared all four values)
- **Local infra**: Azurite is already in `docker-compose.yml`; the only env work is documenting the connection string and container name in `.env.example`
- **Auth**: existing `JwtAuthGuard` is reused on all three submission endpoints; ownership rules are enforced in the service layer (caller is the enrollment owner) and need a join to `challenges.owner_id` for the challenge-owner read path that Phase 5 will rely on heavily
- **No breaking changes**: Phase 0/1/2/3 endpoints are untouched. The frontend changes are additive — a non-enrolled user, a not-yet-submitted user, and an already-submitted user all see exactly what they saw before plus, where relevant, the new panel/list
- **Forward-compat note for Phase 5 (review)**: `GET /enrollments/:id/submissions` already allows the challenge owner to read submissions for any enrollment; Phase 5 will add a sibling `GET /challenges/:id/submissions` (all enrollments) and the approve/reject endpoints
- **Forward-compat note for Phase 7 (Azure)**: `AzureBlobStorageService` consumes `AZURE_STORAGE_CONNECTION_STRING` — in local dev that's `UseDevelopmentStorage=true` (Azurite), in Azure it will be the real Storage Account connection string injected via Key Vault. The service code does not change
