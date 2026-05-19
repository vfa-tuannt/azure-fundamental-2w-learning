# backend-enrollments Specification

## Purpose
TBD - created by syncing change phase-3-enrollment. Update Purpose after archive.

## Requirements

### Requirement: Enrollment entity persistence
The system SHALL persist enrollments in an `enrollments` table with the following columns: `id` (uuid, primary key), `challenge_id` (uuid, not null, foreign key to `challenges.id`), `user_id` (uuid, not null, foreign key to `users.id`), `status` (Postgres enum `enrollment_status` with values `in_progress`, `submitted`, `approved`, `rejected`, not null, defaults to `in_progress`), and `enrolled_at` (timestamptz, not null, defaults to `now()`). The table SHALL be created via a TypeORM migration that also creates the `enrollment_status` enum type, a unique constraint on `(challenge_id, user_id)`, an index on `(user_id, enrolled_at DESC)`, and an index on `(challenge_id)`.

#### Scenario: Migration creates enrollments table and enum
- **WHEN** `yarn migration:run` is executed against a database that already contains the `users` and `challenges` tables
- **THEN** the `enrollment_status` enum type and the `enrollments` table are created with all required columns, both foreign keys, the unique constraint on `(challenge_id, user_id)`, an index on `(user_id, enrolled_at DESC)`, and an index on `(challenge_id)`

#### Scenario: Duplicate enrollment prevented at the database level
- **WHEN** the application attempts to insert a second `enrollments` row with the same `(challenge_id, user_id)` pair
- **THEN** the insert fails with a unique-constraint violation, which the service translates to HTTP 409

#### Scenario: Deleting a referenced challenge is blocked
- **WHEN** the application attempts to hard-delete a `challenges` row that is referenced by at least one `enrollments.challenge_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

#### Scenario: Deleting a referenced user is blocked
- **WHEN** the application attempts to delete a `users` row that is referenced by at least one `enrollments.user_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

### Requirement: Enroll in challenge endpoint
The system SHALL expose `POST /challenges/:id/enroll`, protected by `JwtAuthGuard`, which creates an `enrollments` row for the authenticated user with `status = in_progress`. The endpoint SHALL return HTTP 201 with the new enrollment DTO on success.

#### Scenario: Authenticated user enrolls in an open challenge with seats available
- **WHEN** the authenticated user is NOT the owner, has no existing enrollment for the challenge, the challenge's `status` is `open`, and (`max_enrollments` is null OR the current non-rejected enrollment count is less than `max_enrollments`)
- **THEN** the server inserts a row with `status = in_progress`, responds with HTTP 201, and returns the enrollment DTO `{ id, challengeId, userId, status, enrolledAt }`

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `POST /challenges/:id/enroll` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Challenge does not exist
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` for an id that has no row in `challenges`
- **THEN** the server responds with HTTP 404

#### Scenario: Challenge is soft-deleted
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` for an id whose row has a non-null `deleted_at`
- **THEN** the server responds with HTTP 404

#### Scenario: Challenge is closed
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` for a challenge whose `status` is `closed`
- **THEN** the server responds with HTTP 400 and does NOT insert an enrollment row

#### Scenario: User is the owner of the challenge
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` for a challenge whose `owner_id` equals the JWT's `sub`
- **THEN** the server responds with HTTP 400 and does NOT insert an enrollment row

#### Scenario: User is already enrolled
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` and an `enrollments` row already exists for that `(challenge_id, user_id)` pair
- **THEN** the server responds with HTTP 409 and does NOT insert a second row

#### Scenario: Max enrollments cap reached
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` for a challenge whose `max_enrollments` is a positive integer and whose current count of non-`rejected` enrollments equals or exceeds that integer
- **THEN** the server responds with HTTP 409 and does NOT insert an enrollment row

#### Scenario: Rejected enrollments do not count toward the cap
- **WHEN** a challenge has `max_enrollments: 3` and 3 existing enrollments where one has `status = rejected`
- **THEN** a new `POST /challenges/:id/enroll` from a fourth user succeeds with HTTP 201 because the rejected row does not occupy a seat

### Requirement: Withdraw from challenge endpoint
The system SHALL expose `DELETE /challenges/:id/enroll`, protected by `JwtAuthGuard`, which hard-deletes the authenticated user's enrollment row for the given challenge when its `status` is `in_progress`. The endpoint SHALL return HTTP 204 on success.

#### Scenario: Enrolled user withdraws while in_progress
- **WHEN** the authenticated user has an `enrollments` row for the path challenge with `status = in_progress` and sends `DELETE /challenges/:id/enroll`
- **THEN** the server hard-deletes the row, responds with HTTP 204, and the row is no longer present in any subsequent query

#### Scenario: Withdraw blocked when status is submitted/approved/rejected
- **WHEN** the authenticated user has an `enrollments` row for the path challenge with `status` of `submitted`, `approved`, or `rejected` and sends `DELETE /challenges/:id/enroll`
- **THEN** the server responds with HTTP 409 and the row is NOT deleted

#### Scenario: Withdraw when not enrolled
- **WHEN** the authenticated user has no `enrollments` row for the path challenge and sends `DELETE /challenges/:id/enroll`
- **THEN** the server responds with HTTP 404

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `DELETE /challenges/:id/enroll` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Re-enrollment after withdraw succeeds
- **WHEN** a user withdraws from a challenge (row hard-deleted) and immediately sends `POST /challenges/:id/enroll` again
- **THEN** the server inserts a new enrollment row with a fresh `enrolled_at` timestamp and `status = in_progress`

### Requirement: List my enrollments endpoint
The system SHALL expose `GET /me/enrollments`, protected by `JwtAuthGuard`, which returns the authenticated user's enrollments ordered by `enrolled_at DESC`. Each item SHALL include an embedded challenge summary `{ id, title, deadline, status, requiredSkills }`. Enrollments whose challenge is soft-deleted SHALL be excluded from the response.

#### Scenario: Authenticated user fetches their enrollments
- **WHEN** an authenticated user sends `GET /me/enrollments` and has at least one enrollment whose challenge is not soft-deleted
- **THEN** the server responds with HTTP 200 and an array of `{ id, status, enrolledAt, challenge: { id, title, deadline, status, requiredSkills } }` ordered newest-first

#### Scenario: Empty enrollments list
- **WHEN** an authenticated user sends `GET /me/enrollments` and has no enrollments
- **THEN** the server responds with HTTP 200 and an empty array

#### Scenario: Enrollment of a soft-deleted challenge is excluded
- **WHEN** an authenticated user has an enrollment for a challenge whose `deleted_at` is non-null
- **THEN** that enrollment is NOT included in the response array

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /me/enrollments` without an `Authorization` header
- **THEN** the server responds with HTTP 401

### Requirement: Get my enrollment for challenge endpoint
The system SHALL expose `GET /challenges/:id/enrollment`, protected by `JwtAuthGuard`, which returns the authenticated user's enrollment for the given challenge id, or HTTP 404 if no such enrollment exists. The endpoint SHALL return the bare enrollment DTO `{ id, challengeId, userId, status, enrolledAt }` without an embedded challenge summary.

#### Scenario: Authenticated user has an enrollment
- **WHEN** an authenticated user sends `GET /challenges/:id/enrollment` and has an `enrollments` row for that challenge
- **THEN** the server responds with HTTP 200 and the enrollment DTO

#### Scenario: Authenticated user has no enrollment
- **WHEN** an authenticated user sends `GET /challenges/:id/enrollment` and has no `enrollments` row for that challenge
- **THEN** the server responds with HTTP 404

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /challenges/:id/enrollment` without an `Authorization` header
- **THEN** the server responds with HTTP 401

### Requirement: Enrollment concurrency control
The system SHALL execute the enroll operation (read challenge state → count existing enrollments → insert new enrollment) inside a single database transaction with `SERIALIZABLE` isolation, so that two concurrent `POST /challenges/:id/enroll` requests against the same challenge cannot both succeed in violation of `max_enrollments`.

#### Scenario: Two concurrent enrollments cannot both exceed the cap
- **WHEN** a challenge has `max_enrollments: 1` and two different users send `POST /challenges/:id/enroll` simultaneously
- **THEN** exactly one request responds with HTTP 201 and the other responds with HTTP 409; the database SHALL NOT contain more than one non-rejected enrollment for that challenge

#### Scenario: Same-user duplicate insert is rejected even without serializable
- **WHEN** the same user sends two `POST /challenges/:id/enroll` requests simultaneously for a challenge with no enrollments
- **THEN** exactly one request responds with HTTP 201 and the other responds with HTTP 409 (enforced by the unique constraint on `(challenge_id, user_id)`)

### Requirement: Enrollment DTO shape
The system SHALL serialize enrollments to clients using the bare DTO `{ id (uuid), challengeId (uuid), userId (uuid), status (one of in_progress|submitted|approved|rejected), enrolledAt (ISO 8601 string) }` for endpoints that return a single enrollment. The `GET /me/enrollments` endpoint SHALL extend each item with an embedded `challenge` field `{ id (uuid), title (string), deadline (ISO 8601 string), status (one of open|closed), requiredSkills (string array) }`. Database column names use snake_case; DTO properties use camelCase.

#### Scenario: Bare enrollment DTO uses camelCase
- **WHEN** `POST /challenges/:id/enroll` or `GET /challenges/:id/enrollment` serializes a row
- **THEN** the JSON response uses `challengeId`, `userId`, and `enrolledAt` (camelCase) regardless of the underlying column names

#### Scenario: Embedded challenge summary on /me/enrollments
- **WHEN** `GET /me/enrollments` returns at least one item
- **THEN** each item contains a `challenge` object with exactly the keys `id`, `title`, `deadline`, `status`, and `requiredSkills`
