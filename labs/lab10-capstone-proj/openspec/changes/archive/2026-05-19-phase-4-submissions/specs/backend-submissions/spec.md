## ADDED Requirements

### Requirement: Submission entity persistence
The system SHALL persist submissions in a `submissions` table with the following columns: `id` (uuid, primary key), `enrollment_id` (uuid, not null, foreign key to `enrollments.id` with `ON DELETE RESTRICT`), `blob_url` (text, nullable), `external_url` (text, nullable), `notes` (text, not null, defaults to empty string `''`), and `submitted_at` (timestamptz, not null, defaults to `now()`). The table SHALL be created via a TypeORM migration that also adds a CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)` enforcing that exactly one of the two URL columns is non-null, and an index on `(enrollment_id, submitted_at DESC)` to keep listing fast.

#### Scenario: Migration creates submissions table with XOR constraint
- **WHEN** `yarn migration:run` is executed against a database that already contains the `enrollments` table
- **THEN** the `submissions` table is created with all required columns, the foreign key to `enrollments.id` with `ON DELETE RESTRICT`, the CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)`, and the index on `(enrollment_id, submitted_at DESC)`

#### Scenario: Inserting a row with both URLs is blocked
- **WHEN** the application attempts to insert a `submissions` row with both `blob_url` and `external_url` set to non-null values
- **THEN** the insert fails with a CHECK constraint violation

#### Scenario: Inserting a row with neither URL is blocked
- **WHEN** the application attempts to insert a `submissions` row with both `blob_url` and `external_url` set to `NULL`
- **THEN** the insert fails with a CHECK constraint violation

#### Scenario: Deleting a referenced enrollment is blocked
- **WHEN** the application attempts to hard-delete an `enrollments` row that is referenced by at least one `submissions.enrollment_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

### Requirement: Create submission endpoint
The system SHALL expose `POST /enrollments/:id/submissions`, protected by `JwtAuthGuard`, which accepts either a multipart body with a `file` field (binary file upload) plus an optional `notes` text field, or a JSON body with `{ externalUrl: string, notes?: string }`. On success the endpoint SHALL create a `submissions` row, upload the file (when present) to Azure Blob Storage, flip the enrollment's `status` from `in_progress` to `submitted` in the same database transaction as the insert, and respond with HTTP 201 and the submission DTO.

#### Scenario: Authenticated enrollment owner submits a valid PDF file
- **WHEN** the authenticated user owns an `enrollments` row with `status = in_progress` and sends `POST /enrollments/:id/submissions` as a multipart body containing a file with `Content-Type: application/pdf`, size 5 MB, and optional `notes`
- **THEN** the server uploads the file to the `submissions` container under the object key `{userId}/{enrollmentId}/{uuid}-{sanitizedFilename}`, inserts a `submissions` row with `blob_url` set to the resulting URL and `external_url` set to `NULL`, updates the enrollment's `status` to `submitted`, and responds with HTTP 201 and the submission DTO `{ id, enrollmentId, blobUrl, externalUrl: null, notes, submittedAt }`

#### Scenario: Authenticated enrollment owner submits a valid external URL
- **WHEN** the authenticated user owns an `enrollments` row with `status = in_progress` and sends `POST /enrollments/:id/submissions` with JSON body `{ externalUrl: "https://github.com/user/repo", notes: "See README" }`
- **THEN** the server inserts a `submissions` row with `external_url` set to the provided URL, `blob_url` set to `NULL`, `notes` set to the provided string, updates the enrollment's `status` to `submitted`, and responds with HTTP 201 and the submission DTO `{ id, enrollmentId, blobUrl: null, externalUrl, notes, submittedAt }`

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `POST /enrollments/:id/submissions` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Enrollment does not exist
- **WHEN** an authenticated user sends `POST /enrollments/:id/submissions` for an id that has no row in `enrollments`
- **THEN** the server responds with HTTP 404 and does NOT upload any blob

#### Scenario: Caller is not the enrollment owner
- **WHEN** an authenticated user sends `POST /enrollments/:id/submissions` for an enrollment whose `user_id` does NOT equal the JWT's `sub`
- **THEN** the server responds with HTTP 403 and does NOT upload any blob, even if the caller is the challenge owner

#### Scenario: Enrollment status is not in_progress
- **WHEN** the authenticated enrollment owner sends `POST /enrollments/:id/submissions` for an enrollment whose `status` is `submitted`, `approved`, or `rejected`
- **THEN** the server responds with HTTP 409 and does NOT insert a submission row, upload a blob, or change the enrollment status

#### Scenario: Both file and externalUrl provided
- **WHEN** the authenticated enrollment owner sends `POST /enrollments/:id/submissions` as a multipart body containing both a `file` part AND an `externalUrl` field
- **THEN** the server responds with HTTP 400 and does NOT insert a submission row or upload a blob

#### Scenario: Neither file nor externalUrl provided
- **WHEN** the authenticated enrollment owner sends `POST /enrollments/:id/submissions` with a body containing neither a `file` part nor an `externalUrl` field
- **THEN** the server responds with HTTP 400

#### Scenario: File exceeds 25 MB size limit
- **WHEN** the authenticated enrollment owner uploads a file larger than 25 MB (26,214,400 bytes)
- **THEN** the server responds with HTTP 422 and does NOT insert a submission row or upload a blob

#### Scenario: File MIME type is not on the whitelist
- **WHEN** the authenticated enrollment owner uploads a file whose `Content-Type` is not one of `application/pdf`, `image/png`, `image/jpeg`, `application/zip`, or `text/markdown`
- **THEN** the server responds with HTTP 422 with a body of the form `{ message: string, allowed: string[] }` and does NOT insert a submission row or upload a blob

#### Scenario: File MIME type is on the whitelist but magic bytes do not match
- **WHEN** the authenticated enrollment owner uploads a file with `Content-Type: application/pdf` whose first bytes are NOT `%PDF`
- **THEN** the server responds with HTTP 422 and does NOT insert a submission row or upload a blob

#### Scenario: Submission and enrollment update are atomic
- **WHEN** the file upload to Azurite succeeds but the database transaction inserting the submission row fails
- **THEN** the server responds with an HTTP 5xx error, the enrollment's `status` remains `in_progress`, no `submissions` row is created, and the orphan blob is logged at `error` level with its object key

#### Scenario: Two concurrent submission attempts on the same enrollment
- **WHEN** the authenticated enrollment owner sends two `POST /enrollments/:id/submissions` requests simultaneously for an enrollment with `status = in_progress`
- **THEN** exactly one request responds with HTTP 201 and the other responds with HTTP 409, and the database SHALL contain exactly one new submission row for that enrollment

### Requirement: List submissions for enrollment endpoint
The system SHALL expose `GET /enrollments/:id/submissions`, protected by `JwtAuthGuard`, which returns the submissions for the given enrollment ordered by `submitted_at DESC`. The endpoint SHALL be accessible to either the enrollment owner (caller `id == enrollment.user_id`) OR the challenge owner of the enrollment's challenge (caller `id == challenge.owner_id`).

#### Scenario: Enrollment owner lists their submissions
- **WHEN** the authenticated user is the enrollment owner and sends `GET /enrollments/:id/submissions`
- **THEN** the server responds with HTTP 200 and an array of submission DTOs ordered newest-first

#### Scenario: Challenge owner lists submissions for an enrollment on their challenge
- **WHEN** the authenticated user is the owner of the challenge that the enrollment belongs to (but not the enrollment owner) and sends `GET /enrollments/:id/submissions`
- **THEN** the server responds with HTTP 200 and the same submission DTO array

#### Scenario: Unrelated user denied
- **WHEN** an authenticated user who is neither the enrollment owner nor the challenge owner sends `GET /enrollments/:id/submissions`
- **THEN** the server responds with HTTP 403

#### Scenario: Empty submissions list
- **WHEN** the authenticated enrollment owner sends `GET /enrollments/:id/submissions` for an enrollment that has no submissions yet
- **THEN** the server responds with HTTP 200 and an empty array

#### Scenario: Enrollment does not exist
- **WHEN** an authenticated user sends `GET /enrollments/:id/submissions` for an id that has no row in `enrollments`
- **THEN** the server responds with HTTP 404

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /enrollments/:id/submissions` without an `Authorization` header
- **THEN** the server responds with HTTP 401

### Requirement: Get submission by id endpoint
The system SHALL expose `GET /submissions/:id`, protected by `JwtAuthGuard`, which returns a single submission DTO. The endpoint SHALL be accessible to either the enrollment owner of the submission's enrollment OR the challenge owner of the submission's challenge.

#### Scenario: Enrollment owner fetches their submission
- **WHEN** the authenticated user is the enrollment owner of the submission's enrollment and sends `GET /submissions/:id`
- **THEN** the server responds with HTTP 200 and the submission DTO

#### Scenario: Challenge owner fetches a submission on their challenge
- **WHEN** the authenticated user is the owner of the challenge that the submission's enrollment belongs to and sends `GET /submissions/:id`
- **THEN** the server responds with HTTP 200 and the submission DTO

#### Scenario: Unrelated user denied
- **WHEN** an authenticated user who is neither the enrollment owner nor the challenge owner sends `GET /submissions/:id`
- **THEN** the server responds with HTTP 403

#### Scenario: Submission does not exist
- **WHEN** an authenticated user sends `GET /submissions/:id` for an id that has no row in `submissions`
- **THEN** the server responds with HTTP 404

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /submissions/:id` without an `Authorization` header
- **THEN** the server responds with HTTP 401

### Requirement: Enrollment status transition owned by submissions
The system SHALL transition an enrollment's `status` from `in_progress` to `submitted` only as the result of a successful `POST /enrollments/:id/submissions`. No other code path SHALL write the `submitted` value. The transition SHALL occur atomically with the insert of the submission row in the same database transaction with at least `READ COMMITTED` isolation, and the transaction SHALL acquire a row-level lock (`SELECT ... FOR UPDATE`) on the enrollment row before the status check to serialize against a concurrent withdraw.

#### Scenario: Successful submit flips status to submitted
- **WHEN** a `POST /enrollments/:id/submissions` request completes successfully
- **THEN** the affected enrollment's `status` column is `submitted` in the database immediately after the response is sent

#### Scenario: Failed submit leaves status unchanged
- **WHEN** a `POST /enrollments/:id/submissions` request fails for any reason (validation, authorization, database error, blob upload error)
- **THEN** the affected enrollment's `status` column remains `in_progress`

#### Scenario: Concurrent withdraw during submit
- **WHEN** the authenticated enrollment owner sends `DELETE /challenges/:id/enroll` and `POST /enrollments/:id/submissions` simultaneously for the same enrollment with `status = in_progress`
- **THEN** exactly one operation succeeds: either the row is deleted (withdraw wins) and the submit responds with HTTP 404, or the row is updated to `status = submitted` (submit wins) and the withdraw responds with HTTP 409

### Requirement: Azure Blob Storage adapter
The system SHALL provide a backend service that wraps the `@azure/storage-blob` SDK and exposes a typed interface for uploading submission files. The service SHALL read the connection string from `AZURE_STORAGE_CONNECTION_STRING` and the container name from `AZURE_STORAGE_SUBMISSIONS_CONTAINER` (defaulting to `submissions`). The service SHALL create the container if it does not exist on first upload. The same code SHALL work unchanged against Azurite (connection string `UseDevelopmentStorage=true`) and against a real Azure Storage Account.

#### Scenario: First upload auto-creates the container
- **WHEN** the backend starts against a fresh Azurite instance and the first `POST /enrollments/:id/submissions` request arrives with a file
- **THEN** the service calls `containerClient.createIfNotExists({ access: 'blob' })` before uploading, the `submissions` container is created, and the upload succeeds

#### Scenario: Object key follows the {userId}/{enrollmentId}/{uuid}-{filename} convention
- **WHEN** a file `report.pdf` is uploaded by user `U` for enrollment `E`
- **THEN** the resulting blob's object key matches the regex `^U/E/[0-9a-f-]{36}-report\.pdf$` and the returned `blobUrl` ends with that key

#### Scenario: Filename is sanitised
- **WHEN** a file is uploaded with the filename `../../etc/passwd`
- **THEN** the path separators are stripped from the filename portion before the object key is constructed, so the resulting blob is stored under `{userId}/{enrollmentId}/{uuid}-etcpasswd` (or equivalent — no `..` or `/` survives in the filename component)

### Requirement: Submission DTO shape
The system SHALL serialize submissions to clients using the DTO `{ id (uuid), enrollmentId (uuid), blobUrl (string | null), externalUrl (string | null), notes (string), submittedAt (ISO 8601 string) }`. Exactly one of `blobUrl` and `externalUrl` is non-null per row. Database column names use snake_case; DTO properties use camelCase.

#### Scenario: File submission DTO has blobUrl and null externalUrl
- **WHEN** a `submissions` row was created via file upload
- **THEN** the serialized DTO has `blobUrl` as a non-empty string and `externalUrl` as `null`

#### Scenario: URL submission DTO has externalUrl and null blobUrl
- **WHEN** a `submissions` row was created via external URL
- **THEN** the serialized DTO has `externalUrl` as a non-empty string and `blobUrl` as `null`

#### Scenario: DTO uses camelCase
- **WHEN** any submission endpoint serializes a row
- **THEN** the JSON response uses `enrollmentId`, `blobUrl`, `externalUrl`, and `submittedAt` (camelCase) regardless of the underlying column names
