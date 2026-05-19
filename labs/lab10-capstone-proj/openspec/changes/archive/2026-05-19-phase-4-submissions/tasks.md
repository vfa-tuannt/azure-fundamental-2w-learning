## 1. Backend — Dependencies and Environment

- [x] 1.1 Add `@azure/storage-blob` to `backend/package.json` via `yarn add @azure/storage-blob` (no other new deps — `multer` is already bundled with `@nestjs/platform-express`)
- [x] 1.2 Append to `backend/.env.example`:
  ```
  # Azure Blob Storage (Azurite locally; real Storage Account in Phase 7)
  AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
  AZURE_STORAGE_SUBMISSIONS_CONTAINER=submissions
  ```
- [x] 1.3 Append the same two values to local `backend/.env` and verify `docker compose up -d azurite` is running (`docker ps | grep azurite`)
- [x] 1.4 Quick sanity check: from a Node REPL or a throwaway script, `new BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true').getContainerClient('submissions').createIfNotExists()` succeeds against the running Azurite — this confirms the local stack is wired

## 2. Backend — Submission Entity and Module

- [x] 2.1 Create `Submission` entity at `backend/src/submissions/submission.entity.ts` with columns `id` (uuid PK), `enrollmentId` (uuid, column `enrollment_id`), `blobUrl` (text nullable, column `blob_url`), `externalUrl` (text nullable, column `external_url`), `notes` (text, column `notes`, default `''`), `submittedAt` (`@CreateDateColumn` column `submitted_at`); `@ManyToOne` to `Enrollment` with `onDelete: 'RESTRICT'`; class-level `@Index('IDX_submissions_enrollment_submitted', ['enrollmentId', 'submittedAt'])`
- [x] 2.2 Add `Submission` to the entities array in `backend/src/app.module.ts` and `backend/src/data-source.ts`
- [x] 2.3 Create DTOs in `backend/src/submissions/dto/`: `submission.dto.ts` (TypeScript interface for the wire shape) and `create-submission.dto.ts` (with `@IsOptional() @IsUrl({ require_tld: false }) externalUrl?: string`; `@IsOptional() @IsString() @MaxLength(2000) notes?: string`) — the `file` is parsed by multer, not validated by class-validator
- [x] 2.4 Create `SubmissionsModule` at `backend/src/submissions/submissions.module.ts` importing `TypeOrmModule.forFeature([Submission, Enrollment, Challenge])`, providing `SubmissionsService` and `AzureBlobStorageService`, and exporting `SubmissionsService` (Phase 5 will import it)
- [x] 2.5 Register `SubmissionsModule` in `AppModule`

## 3. Backend — Azure Blob Storage Adapter

- [x] 3.1 Create `AzureBlobStorageService` at `backend/src/submissions/azure-blob-storage.service.ts` with a lazy `BlobServiceClient` initialized from `AZURE_STORAGE_CONNECTION_STRING`; constructor reads `AZURE_STORAGE_SUBMISSIONS_CONTAINER` from `ConfigService` (default `submissions`)
- [x] 3.2 Implement `private async getContainer()` that calls `containerClient.createIfNotExists({ access: 'blob' })` once per process (cache the resolved client in an instance field after first creation)
- [x] 3.3 Implement `async upload(buffer: Buffer, contentType: string, objectKey: string): Promise<{ blobUrl: string, objectKey: string }>` using `blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } })`; return `{ blobUrl: blockBlobClient.url, objectKey }`
- [x] 3.4 Implement `async delete(objectKey: string): Promise<void>` (called by future sweeper; declared now so Phase 7 doesn't need to revisit)
- [x] 3.5 Implement `private sanitizeFilename(name: string): string` that strips `/`, `\`, control chars, leading dots, and limits to 100 chars
- [x] 3.6 Implement `buildObjectKey(userId: string, enrollmentId: string, filename: string): string` returning `${userId}/${enrollmentId}/${uuid()}-${sanitized}`
- [x] 3.7 Unit test the service with a mocked `BlobServiceClient`: `buildObjectKey` returns the expected shape; `upload` calls `uploadData` with the right args; the container is auto-created on first use

## 4. Backend — Submissions Service (Business Logic)

- [x] 4.1 Create `SubmissionsService` at `backend/src/submissions/submissions.service.ts` with injected `Repository<Submission>`, `Repository<Enrollment>`, `Repository<Challenge>`, `DataSource`, `AzureBlobStorageService`, and a NestJS `Logger`
- [x] 4.2 Define constants `MAX_FILE_BYTES = 25 * 1024 * 1024` and `ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'application/zip', 'text/markdown']`
- [x] 4.3 Implement `validateFile(file: Express.Multer.File)`: throw `UnprocessableEntityException({ message, allowed: ALLOWED_MIME })` if `mimetype` is not in the whitelist; throw `UnprocessableEntityException` if `size > MAX_FILE_BYTES`; for the binary types (`pdf`, `png`, `jpeg`, `zip`) sniff the first bytes of `file.buffer` and throw `UnprocessableEntityException` if magic bytes don't match
- [x] 4.4 Implement `private async loadEnrollmentWithChallenge(enrollmentId: string)` that returns `{ enrollment, challenge }` via a single query joining `enrollments` to `challenges`; throws `NotFoundException` if missing
- [x] 4.5 Implement `private assertEnrollmentReadable(enrollment, challenge, callerUserId)` that allows when `enrollment.userId === callerUserId || challenge.ownerId === callerUserId`, else throws `ForbiddenException`
- [x] 4.6 Implement `createFromFile(enrollmentId, userId, file, notes)`:
  - validate file via `validateFile`
  - load enrollment + challenge; 404 if missing
  - 403 if `enrollment.userId !== userId`
  - 409 if `enrollment.status !== 'in_progress'`
  - build object key via `azureBlob.buildObjectKey(userId, enrollmentId, file.originalname)`
  - upload buffer via `azureBlob.upload(file.buffer, file.mimetype, objectKey)` → `{ blobUrl, objectKey }`
  - wrap in `dataSource.transaction(async (manager) => { ... })`:
    - reload enrollment with `manager.findOne(Enrollment, { where: { id }, lock: { mode: 'pessimistic_write' } })`
    - re-check `status === 'in_progress'` (throw `ConflictException` if not — handles the concurrent-submit race)
    - insert submission row with `blobUrl` set, `externalUrl: null`, `notes: notes ?? ''`
    - update enrollment to `status: 'submitted'`
  - if the transaction throws: log `Orphan blob created during failed submission: ${objectKey}` at error level, then rethrow
  - return the submission DTO
- [x] 4.7 Implement `createFromUrl(enrollmentId, userId, externalUrl, notes)`:
  - basic URL validation (the DTO already covers this) — re-throw `BadRequestException` if it slips through
  - load enrollment + challenge; 404 / 403 / 409 same as 4.6
  - wrap in transaction with pessimistic lock, same atomic insert + status flip
  - return the submission DTO
- [x] 4.8 Implement `listForEnrollment(enrollmentId, callerUserId)`:
  - load enrollment + challenge; 404 if missing
  - `assertEnrollmentReadable` (allows enrollment owner OR challenge owner)
  - return submissions ordered `submittedAt DESC` as DTOs
- [x] 4.9 Implement `findById(submissionId, callerUserId)`:
  - load submission; if missing throw 404
  - load the submission's enrollment + challenge via the same helper
  - `assertEnrollmentReadable`
  - return the DTO
- [x] 4.10 Export `getSubmissionContext(submissionId)` (returning `{ submission, enrollment, challenge }`) — needed by Phase 5's review endpoints; declare now so Phase 5 imports from `SubmissionsService` rather than rewriting the join

## 5. Backend — Submissions and Enrollments Controllers

- [x] 5.1 Create `EnrollmentSubmissionsController` at `backend/src/submissions/enrollment-submissions.controller.ts` with class-level `@Controller('enrollments/:id/submissions')` (separate from `EnrollmentsController` from Phase 3 to avoid path conflicts)
- [x] 5.2 Add `POST /enrollments/:id/submissions`:
  - `@UseGuards(JwtAuthGuard)`
  - `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))`
  - `@HttpCode(201)`
  - `@Param('id', ParseUUIDPipe)`, `@UploadedFile() file?: Express.Multer.File`, `@Body() body: CreateSubmissionDto`
  - reject 400 if both `file` and `body.externalUrl` are present, or both are absent
  - dispatch to `submissionsService.createFromFile(...)` or `createFromUrl(...)` accordingly
- [x] 5.3 Translate multer's `PayloadTooLargeException` / `LIMIT_FILE_SIZE` into HTTP 422 with the standard `{ message, allowed: ALLOWED_MIME }` body — wire a small NestJS exception filter at the controller level, or pre-check `file?.size > MAX_FILE_BYTES` in the route handler
- [x] 5.4 Add `GET /enrollments/:id/submissions`: `@UseGuards(JwtAuthGuard)`, `@Param('id', ParseUUIDPipe)`; calls `submissionsService.listForEnrollment(id, req.user.id)`; returns `SubmissionDto[]`
- [x] 5.5 Create `SubmissionsController` at `backend/src/submissions/submissions.controller.ts` with class-level `@Controller('submissions')`
- [x] 5.6 Add `GET /submissions/:id`: `@UseGuards(JwtAuthGuard)`, `@Param('id', ParseUUIDPipe)`; calls `submissionsService.findById(id, req.user.id)`; returns `SubmissionDto`
- [x] 5.7 Register both controllers in `SubmissionsModule`

## 6. Backend — Migration

- [x] 6.1 Run `yarn migration:generate -- ./src/migrations/CreateSubmissionsTable` to scaffold the migration
- [x] 6.2 Hand-edit the generated migration:
  - Add the CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)` (TypeORM does not generate CHECK from decorators reliably)
  - Add `DESC` to the `(enrollment_id, submitted_at)` index — TypeORM emits it without `DESC`
  - Verify FK `submissions.enrollment_id → enrollments.id` uses `ON DELETE RESTRICT`
  - Verify `submitted_at` column default is `now()`
  - Verify `notes` column default is empty string `''`
- [x] 6.3 Verify `down()` drops the index, the CHECK constraint, the FK, and the table in the right order
- [x] 6.4 Run `yarn migration:run` against local Docker Compose Postgres
- [x] 6.5 Verify with `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "\d submissions"` that the table, index, CHECK, and FK are present

## 7. Backend — Tests

- [x] 7.1 Unit test `AzureBlobStorageService.buildObjectKey`: produces `{userId}/{enrollmentId}/{uuid-regex}-{sanitized}`; strips `/`, `\`, control chars; truncates long filenames
- [x] 7.2 Unit test `AzureBlobStorageService.upload` with a mocked `BlockBlobClient.uploadData`: called with the right args; returns `{ blobUrl, objectKey }`
- [x] 7.3 Unit test `SubmissionsService.validateFile`: rejects oversized files (422), rejects wrong MIME (422), rejects magic-byte mismatches for `pdf`/`png`/`jpeg`/`zip`, accepts valid PDF + PNG + JPEG + ZIP + Markdown
- [x] 7.4 Unit test `SubmissionsService.createFromFile`: happy path returns the DTO, calls `azureBlob.upload` once, inserts one row, flips enrollment to `submitted`
- [x] 7.5 Unit test `SubmissionsService.createFromFile`: throws `NotFoundException` when enrollment is missing; does NOT call upload
- [x] 7.6 Unit test `SubmissionsService.createFromFile`: throws `ForbiddenException` when caller is not the enrollment owner (even if challenge owner)
- [x] 7.7 Unit test `SubmissionsService.createFromFile`: throws `ConflictException` when enrollment status is `submitted`/`approved`/`rejected`
- [x] 7.8 Unit test `SubmissionsService.createFromFile`: on transaction failure, logs the orphan key at error level and rethrows
- [x] 7.9 Unit test `SubmissionsService.createFromUrl`: happy path inserts row with `externalUrl` set, `blobUrl: null`; flips status
- [x] 7.10 Unit test `SubmissionsService.createFromUrl`: 403 for non-owner, 409 for wrong status (mirror file-mode coverage)
- [x] 7.11 Unit test `SubmissionsService.listForEnrollment`: visible to enrollment owner; visible to challenge owner; 403 for unrelated user
- [x] 7.12 Unit test `SubmissionsService.findById`: visible to enrollment owner + challenge owner; 403 otherwise; 404 when missing
- [x] 7.13 E2E test `POST /enrollments/:id/submissions` (multipart): 201 happy path with PDF; 401 unauth; 403 non-owner; 409 wrong status; 422 oversized; 422 wrong MIME; 400 when both file and externalUrl set; 400 when neither set
- [x] 7.14 E2E test `POST /enrollments/:id/submissions` (JSON): 201 with externalUrl; 422 not applicable; validates URL format via class-validator
- [x] 7.15 E2E test `GET /enrollments/:id/submissions`: enrollment owner 200; challenge owner 200; unrelated 403; 404 when enrollment missing; 401 unauth
- [x] 7.16 E2E test `GET /submissions/:id`: same auth matrix as the list endpoint

## 8. Backend — Gates

- [x] 8.1 `yarn lint` passes with no errors
- [x] 8.2 `yarn test` passes with no failures (unit + E2E)
- [x] 8.3 `yarn tsc --noEmit` clean

## 9. Frontend — Types

- [x] 9.1 Extend `frontend/src/api/types.ts` with: `Submission = { id: string; enrollmentId: string; blobUrl: string | null; externalUrl: string | null; notes: string; submittedAt: string }`
- [x] 9.2 Do NOT modify existing types — Phase 3's `Enrollment`/`MyEnrollment` shapes are reused as-is

## 10. Frontend — API Client

- [x] 10.1 Create `frontend/src/api/submissions.ts` exporting three functions:
  - `createFileSubmission(enrollmentId, file: File, notes?: string): Promise<Submission>` — builds `FormData`, appends `file` and optional `notes`, POSTs as `multipart/form-data`
  - `createUrlSubmission(enrollmentId, externalUrl: string, notes?: string): Promise<Submission>` — POSTs JSON
  - `listForEnrollment(enrollmentId): Promise<Submission[]>` — GET, returns array
- [x] 10.2 All three functions use the existing axios instance from `frontend/src/api/axios.ts` so the JWT is attached automatically

## 11. Frontend — Pinia Store

- [x] 11.1 Create `frontend/src/stores/submissions.ts` defining `useSubmissionsStore` with state `byEnrollmentId: Map<string, Submission[]>`, `loading: boolean`, `error: string | null`
- [x] 11.2 Action `loadForEnrollment(enrollmentId)` — sets loading, calls the API, populates the Map entry, sets error on failure
- [x] 11.3 Action `createFileSubmission(enrollmentId, file, notes?)` — calls the API; on success unshifts the new submission into `byEnrollmentId.get(enrollmentId)` (initializing to `[]` if missing); returns the new submission
- [x] 11.4 Action `createUrlSubmission(enrollmentId, externalUrl, notes?)` — same shape as 11.3 but URL mode
- [x] 11.5 Action `reset()` — clears all state (matches `enrollmentsStore.reset`)
- [x] 11.6 In `frontend/src/stores/auth.ts` `logout()`, also call `useSubmissionsStore().reset()` so submissions don't leak across accounts

## 12. Frontend — ChallengeDetailView Update

- [x] 12.1 In `ChallengeDetailView.vue`, import the submissions store and call `submissionsStore.loadForEnrollment(myEnrollment.id)` in the `load()` function (after the enrollments load) when the caller has any enrollment for the challenge
- [x] 12.2 Add reactive state `submitMode = ref<'file' | 'url'>('file')`, `selectedFile = ref<File | null>(null)`, `externalUrl = ref('')`, `notes = ref('')`, `submitting = ref(false)`
- [x] 12.3 Add computed `canShowSubmitPanel` = `!!myEnrollment && myEnrollment.status === 'in_progress' && !isOwner`
- [x] 12.4 Add computed `mySubmissions` = `submissionsStore.byEnrollmentId.get(myEnrollment?.id ?? '') ?? []`
- [x] 12.5 Render the **Submit Output** panel under the description (above the button row) when `canShowSubmitPanel`:
  - PrimeVue `SelectButton` bound to `submitMode` with options `[{label:'File', value:'file'}, {label:'External URL', value:'url'}]`
  - `v-if="submitMode === 'file'"`: PrimeVue `FileUpload` with `mode="basic"` OR `mode="advanced"`, `:auto="false"`, `:show-upload-button="false"`, `:show-cancel-button="false"`, `chooseLabel="Choose file"`, `accept=".pdf,.png,.jpg,.jpeg,.zip,.md"`, `:maxFileSize="25 * 1024 * 1024"`, `@select="onFileSelect"` (sets `selectedFile`), `@clear="selectedFile = null"`
  - `v-else`: PrimeVue `InputText` bound to `externalUrl` with `type="url"` and `placeholder="https://..."`
  - Shared PrimeVue `Textarea` bound to `notes` with `rows="3"` and `placeholder="Optional notes for the reviewer"`
  - A `Button label="Submit"`, `:loading="submitting"`, `:disabled="!isFormValid"`, `@click="onSubmit"`
- [x] 12.6 Implement `onSubmit()`:
  - validate (`selectedFile` non-null in file mode; valid `URL` in url mode); show error Toast otherwise
  - set `submitting.value = true`
  - call `submissionsStore.createFileSubmission(myEnrollment.id, selectedFile.value!, notes.value)` OR `createUrlSubmission(myEnrollment.id, externalUrl.value, notes.value)`
  - on success: `enrollments.byChallengeId.get(challenge.value.id).status = 'submitted'` (the button matrix already reacts), Toast success, clear form, hide panel
  - on 422: Toast with the server's `message` (e.g., "File type not allowed")
  - on 409: Toast "This enrollment is no longer in progress; please refresh"
  - on other errors: Toast with `extractApiMessage(err)` (reuse the helper from Phase 3)
  - finally: `submitting.value = false`
- [x] 12.7 Render the **My Submissions** list below the panel (or above, by design preference) when `mySubmissions.length > 0`:
  - `<ul>` with each entry showing:
    - Filename (parsed from `blobUrl` via `decodeURIComponent(blobUrl.split('/').pop() ?? '').replace(/^[0-9a-f-]{36}-/, '')`) OR the `externalUrl`
    - The link opens `blobUrl || externalUrl` in a new tab (`target="_blank" rel="noopener"`)
    - Relative time for `submittedAt` (use a small util or `new Date(submittedAt).toLocaleString()` for v1)
    - The `notes` text on a second line when non-empty

## 13. Frontend — Gates

- [x] 13.1 `yarn type-check` passes
- [x] 13.2 `yarn build` succeeds with no TS errors
- [x] 13.3 `yarn lint` passes (if a lint script exists)

## 14. Browser Verification

> All tasks below require two Vitalify-domain Google accounts (or `AUTH_ALLOWED_DOMAINS=vitalify.asia,gmail.com` for a personal-account workaround) and a running local stack: `docker compose up -d`, `yarn migration:run`, `yarn start:dev` (backend), `yarn dev` (frontend).

- [x] 14.1 Sign in as Account A and create a fresh challenge `Phase 4 demo` with `max_enrollments: 5`
- [x] 14.2 Sign in as Account B in a second browser; enroll in the challenge; confirm the **Submit Output** panel appears under the description
- [x] 14.3 In File mode, upload a small valid PDF; confirm: success Toast, panel disappears, button matrix shows "Enrolled (Submitted)" disabled, the new submission appears in the My Submissions list with a clickable filename link
- [x] 14.4 Click the filename link; confirm the PDF opens in a new tab from the Azurite URL
- [x] 14.5 As Account A, view the challenge detail page; the Submit Output panel should NOT render (owner)
- [x] 14.6 In pgAdmin or via `psql`, verify the `enrollments` row for Account B now has `status = 'submitted'` and the `submissions` row exists with the expected `blob_url`
- [x] 14.7 As Account B, try to submit again; the panel is gone so this should be impossible from the UI — confirm
- [x] 14.8 Create another fresh challenge as Account A and enroll a third account (or have Account B re-enroll after a fresh challenge); switch to **External URL** mode, paste `https://github.com/example/repo`, add notes, Submit; confirm: success, list updates, status flips
- [x] 14.9 Open a fresh enrollment and try to upload a `.exe` file via the FE (drag-drop bypassing the file-picker filter); confirm: 422 Toast with the allowed-types message
- [x] 14.10 Try to upload a 30 MB PDF; confirm: 422 Toast (size limit)
- [x] 14.11 As Account A (challenge owner), confirm calling `GET /enrollments/{B-enrollment-id}/submissions` via Postman/curl returns Account B's submission (cross-user authorization works for the read path that Phase 5 will use)
- [x] 14.12 As a third unrelated account (not owner, not enrollment owner), confirm `GET /enrollments/{B-enrollment-id}/submissions` returns 403
- [x] 14.13 Log out as Account B and confirm the My Submissions list disappears on the challenge detail page (auth-store reset wired correctly)
