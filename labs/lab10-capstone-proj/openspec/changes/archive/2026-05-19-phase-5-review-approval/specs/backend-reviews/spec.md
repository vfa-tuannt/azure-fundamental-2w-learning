## ADDED Requirements

### Requirement: Approve submission endpoint
The system SHALL expose `POST /submissions/:id/approve`, protected by `JwtAuthGuard`, which transitions the parent enrollment's `status` from `submitted` to `approved` and stamps the submission's `reviewed_at` column with the current server time. The endpoint accepts no request body. The endpoint SHALL be authorized only when the caller's JWT `sub` equals the `owner_id` of the challenge that owns the submission's enrollment. On success the endpoint SHALL respond with HTTP 200 and the updated submission DTO (which includes the new `reviewedAt` value and a `rejectionReason` of `null`).

#### Scenario: Authenticated challenge owner approves a submitted submission
- **WHEN** the authenticated user is the owner of the challenge whose enrollment owns the submission, the parent enrollment's `status` is `submitted`, and the user sends `POST /submissions/:id/approve`
- **THEN** the server updates the enrollment's `status` to `approved` and the submission's `reviewed_at` to the current server time inside a single transaction, responds with HTTP 200, and returns the submission DTO with `reviewedAt` non-null and `rejectionReason` set to `null`

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `POST /submissions/:id/approve` without an `Authorization` header
- **THEN** the server responds with HTTP 401 and does NOT modify any rows

#### Scenario: Submission does not exist
- **WHEN** an authenticated user sends `POST /submissions/:id/approve` for an id that has no row in `submissions`
- **THEN** the server responds with HTTP 404 and does NOT modify any rows

#### Scenario: Caller is not the challenge owner
- **WHEN** an authenticated user who is neither the challenge owner sends `POST /submissions/:id/approve` (including the case where the caller is the enrollment owner / submitter)
- **THEN** the server responds with HTTP 403 and does NOT modify any rows

#### Scenario: Enrollment status is not submitted
- **WHEN** the challenge owner sends `POST /submissions/:id/approve` for a submission whose parent enrollment's `status` is `in_progress`, `approved`, or `rejected`
- **THEN** the server responds with HTTP 409 and does NOT modify any rows

#### Scenario: Two concurrent approve requests on the same submission
- **WHEN** the challenge owner sends two `POST /submissions/:id/approve` requests simultaneously against the same submission whose enrollment `status` is `submitted`
- **THEN** exactly one request responds with HTTP 200 and the other responds with HTTP 409 (`SELECT ... FOR UPDATE` on the enrollment row serializes the operations)

### Requirement: Reject submission endpoint
The system SHALL expose `POST /submissions/:id/reject`, protected by `JwtAuthGuard`, which transitions the parent enrollment's `status` from `submitted` to `rejected`, stamps the submission's `reviewed_at` with the current server time, and stores an optional rejection reason on the submission's `rejection_reason` column. The endpoint accepts a JSON body `{ reason?: string }` where `reason` is optional and, when present, MUST be ≤ 1000 characters. The endpoint SHALL be authorized only when the caller's JWT `sub` equals the `owner_id` of the challenge that owns the submission's enrollment. On success the endpoint SHALL respond with HTTP 200 and the updated submission DTO.

#### Scenario: Authenticated challenge owner rejects with a reason
- **WHEN** the authenticated user is the owner of the challenge whose enrollment owns the submission, the parent enrollment's `status` is `submitted`, and the user sends `POST /submissions/:id/reject` with JSON body `{ reason: "Output does not match the required ARM template structure" }`
- **THEN** the server updates the enrollment's `status` to `rejected`, the submission's `reviewed_at` to the current server time, and the submission's `rejection_reason` to the provided string inside a single transaction; the server responds with HTTP 200 and the submission DTO with `reviewedAt` non-null and `rejectionReason` equal to the provided string

#### Scenario: Authenticated challenge owner rejects without a reason
- **WHEN** the challenge owner sends `POST /submissions/:id/reject` with an empty JSON body `{}`, with body `{ reason: "" }`, or with body `{ reason: "   " }` (whitespace-only)
- **THEN** the server updates the enrollment's `status` to `rejected` and the submission's `reviewed_at`, sets `rejection_reason` to `NULL` (not empty string), responds with HTTP 200, and returns the DTO with `rejectionReason: null`

#### Scenario: Reason exceeds maximum length
- **WHEN** the challenge owner sends `POST /submissions/:id/reject` with a `reason` longer than 1000 characters
- **THEN** the server responds with HTTP 400 (validation error from `class-validator`) and does NOT modify any rows

#### Scenario: Reason is not a string
- **WHEN** the challenge owner sends `POST /submissions/:id/reject` with a body whose `reason` field is a number, object, or array
- **THEN** the server responds with HTTP 400 and does NOT modify any rows

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `POST /submissions/:id/reject` without an `Authorization` header
- **THEN** the server responds with HTTP 401 and does NOT modify any rows

#### Scenario: Submission does not exist
- **WHEN** an authenticated user sends `POST /submissions/:id/reject` for an id that has no row in `submissions`
- **THEN** the server responds with HTTP 404 and does NOT modify any rows

#### Scenario: Caller is not the challenge owner
- **WHEN** an authenticated user who is not the challenge owner (including the enrollment owner / submitter) sends `POST /submissions/:id/reject`
- **THEN** the server responds with HTTP 403 and does NOT modify any rows

#### Scenario: Enrollment status is not submitted
- **WHEN** the challenge owner sends `POST /submissions/:id/reject` for a submission whose parent enrollment's `status` is `in_progress`, `approved`, or `rejected`
- **THEN** the server responds with HTTP 409 and does NOT modify any rows

#### Scenario: Approve and reject cannot interleave
- **WHEN** the challenge owner sends `POST /submissions/:id/approve` and `POST /submissions/:id/reject` simultaneously for a submission whose enrollment `status` is `submitted`
- **THEN** exactly one request responds with HTTP 200 and the other responds with HTTP 409

### Requirement: List submissions for challenge endpoint
The system SHALL expose `GET /challenges/:id/submissions`, protected by `JwtAuthGuard`, which returns every submission across every enrollment for the challenge, ordered by `submittedAt DESC`. The endpoint SHALL be authorized only when the caller's JWT `sub` equals the challenge's `owner_id`. The endpoint SHALL NOT filter out submissions whose parent enrollment is in any particular state — `submitted`, `approved`, and `rejected` enrollments are all included.

#### Scenario: Challenge owner lists submissions on their challenge
- **WHEN** the authenticated user is the owner of the challenge and sends `GET /challenges/:id/submissions`
- **THEN** the server responds with HTTP 200 and an array of submission DTOs (each extended per the "Challenge-scoped submission DTO shape" requirement) ordered newest-first

#### Scenario: Empty list when no enrollments have submitted
- **WHEN** the challenge owner sends `GET /challenges/:id/submissions` for a challenge with zero submissions across all enrollments
- **THEN** the server responds with HTTP 200 and an empty array

#### Scenario: Non-owner authenticated user denied
- **WHEN** an authenticated user who is not the challenge owner (including users with their own enrollment on the challenge) sends `GET /challenges/:id/submissions`
- **THEN** the server responds with HTTP 403

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /challenges/:id/submissions` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Challenge does not exist
- **WHEN** an authenticated user sends `GET /challenges/:id/submissions` for an id that has no row in `challenges`
- **THEN** the server responds with HTTP 404

#### Scenario: Challenge is soft-deleted
- **WHEN** an authenticated user sends `GET /challenges/:id/submissions` for a challenge whose `deleted_at` is non-null
- **THEN** the server responds with HTTP 404 (consistent with `GET /challenges/:id` Phase 2 behaviour)

#### Scenario: Reviewed and unreviewed submissions both appear
- **WHEN** the challenge owner sends `GET /challenges/:id/submissions` for a challenge with three submissions whose enrollments have statuses `submitted`, `approved`, and `rejected` respectively
- **THEN** the server returns all three rows, each row's `enrollment.status` reflects the current status, and `reviewedAt` / `rejectionReason` are populated for the `approved` and `rejected` rows and null for the `submitted` row

### Requirement: Challenge-scoped submission DTO shape
The system SHALL serialize each item in the `GET /challenges/:id/submissions` response as the standard submission DTO (`{ id, enrollmentId, blobUrl, externalUrl, notes, submittedAt, rejectionReason, reviewedAt }`) extended with two additional embedded objects: `enrollment: { id (uuid), userId (uuid), status (one of in_progress|submitted|approved|rejected) }` and `submitter: { id (uuid), name (string), email (string), avatarUrl (string | null) }`. Database column names use snake_case; DTO properties use camelCase.

#### Scenario: Each list item embeds the submitter's identity
- **WHEN** `GET /challenges/:id/submissions` returns a row
- **THEN** the row contains a `submitter` object with exactly the keys `id`, `name`, `email`, and `avatarUrl`, sourced from the `users` row whose `id` equals the enrollment's `user_id`

#### Scenario: Each list item embeds the enrollment status
- **WHEN** `GET /challenges/:id/submissions` returns a row whose parent enrollment has `status = approved`
- **THEN** the row contains an `enrollment` object with `id`, `userId`, and `status: "approved"`

#### Scenario: DTO uses camelCase
- **WHEN** any review endpoint serializes a submission
- **THEN** the JSON response uses `enrollmentId`, `blobUrl`, `externalUrl`, `submittedAt`, `reviewedAt`, `rejectionReason`, and `avatarUrl` (camelCase) regardless of the underlying snake_case column names

### Requirement: Review transaction concurrency control
The system SHALL execute the approve and reject operations inside a single database transaction that acquires a row-level write lock (`SELECT ... FOR UPDATE`) on the parent enrollment row before checking its `status` and before writing either the submission row or the enrollment row. The lock SHALL be acquired in the same transaction as the writes so that two concurrent review requests against the same enrollment cannot both succeed.

#### Scenario: Concurrent approve attempts on the same enrollment
- **WHEN** two `POST /submissions/:id/approve` requests are issued simultaneously against the same submission whose parent enrollment has `status = submitted`
- **THEN** exactly one request commits and responds with HTTP 200; the other request sees the new `approved` status after acquiring the lock and responds with HTTP 409

#### Scenario: Concurrent approve and reject against the same enrollment
- **WHEN** one `POST /submissions/:id/approve` and one `POST /submissions/:id/reject` are issued simultaneously against the same submission whose parent enrollment has `status = submitted`
- **THEN** exactly one request commits and responds with HTTP 200; the other responds with HTTP 409

#### Scenario: Failed review leaves status unchanged
- **WHEN** the database transaction inside `POST /submissions/:id/approve` or `POST /submissions/:id/reject` fails for any reason after the status check
- **THEN** the enrollment's `status` remains `submitted`, the submission's `rejection_reason` and `reviewed_at` remain at their pre-request values, and the server responds with an HTTP 5xx error
