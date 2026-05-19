# backend-challenges Specification

## Purpose
TBD - created by archiving change phase-2-challenges-crud. Update Purpose after archive.
## Requirements
### Requirement: Challenge entity persistence
The system SHALL persist challenges in a `challenges` table with the following columns: `id` (uuid, primary key), `owner_id` (uuid, not null, foreign key to `users.id`), `title` (varchar, not null), `description` (text, not null), `required_skills` (text array, not null, defaults to empty array), `deadline` (timestamptz, not null), `max_enrollments` (integer, nullable), `status` (Postgres enum `challenge_status` with values `open` and `closed`, not null, defaults to `open`), `created_at` (timestamptz, not null, defaults to `now()`), and `deleted_at` (timestamptz, nullable). The table SHALL be created via a TypeORM migration.

#### Scenario: Migration creates challenges table and enum
- **WHEN** `yarn migration:run` is executed against a database that already contains the `users` table
- **THEN** the `challenge_status` enum type and the `challenges` table are created with all required columns, the foreign key to `users.id`, an index on `(status, deleted_at, created_at DESC)`, and a GIN index on `required_skills`

#### Scenario: Deleting a referenced user is blocked
- **WHEN** the application attempts to delete a `users` row that is referenced by at least one `challenges.owner_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

### Requirement: Create challenge endpoint
The system SHALL expose `POST /challenges`, protected by `JwtAuthGuard`, which creates a challenge owned by the authenticated user. The request body SHALL accept `title` (non-empty string), `description` (non-empty string), `required_skills` (string array; may be empty), `deadline` (ISO 8601 date-time in the future), and `max_enrollments` (positive integer, optional). The response SHALL be the full challenge DTO with HTTP 201.

#### Scenario: Authenticated user creates a challenge
- **WHEN** a client sends `POST /challenges` with a valid JWT and a valid body
- **THEN** the server inserts a new row with `owner_id` set to the JWT's `sub`, `status` defaulted to `open`, and responds with HTTP 201 and the created challenge as JSON including `id`, `owner_id`, `title`, `description`, `required_skills`, `deadline`, `max_enrollments`, `status`, `created_at`, and `enrollments_count: 0`

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `POST /challenges` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Invalid body rejected
- **WHEN** a client sends `POST /challenges` with a missing `title`, an empty `description`, a non-array `required_skills`, a past `deadline`, or a `max_enrollments <= 0`
- **THEN** the server responds with HTTP 400 and a validation error message listing the offending fields

#### Scenario: Unknown fields rejected
- **WHEN** a client sends `POST /challenges` with a body containing `status: "closed"` or any other field not listed in the DTO
- **THEN** the server responds with HTTP 400 (`forbidNonWhitelisted`)

### Requirement: List challenges endpoint
The system SHALL expose `GET /challenges` as a public (no-auth) endpoint returning a paginated list of challenges that are NOT soft-deleted. The endpoint SHALL accept `?page` (positive integer, defaults to 1), `?limit` (1–100, defaults to 20), `?status` (one of `open` or `closed`, optional), and `?skill` (string, optional, case-insensitive substring match against any element of `required_skills`). The response SHALL be `{ items: ChallengeDto[], page: number, limit: number, total: number }`. Each item SHALL include `enrollments_count` (number, hard-coded to `0` in Phase 2).

#### Scenario: Default pagination
- **WHEN** a client sends `GET /challenges` with no query parameters
- **THEN** the server returns at most 20 non-deleted challenges ordered by `created_at DESC`, plus `page: 1`, `limit: 20`, and the total count of non-deleted challenges

#### Scenario: Filter by status
- **WHEN** a client sends `GET /challenges?status=closed`
- **THEN** the server returns only challenges whose `status` is `closed` and excludes any soft-deleted rows

#### Scenario: Filter by skill (case-insensitive substring)
- **WHEN** a client sends `GET /challenges?skill=azure`
- **THEN** the server returns challenges where at least one element of `required_skills` contains the substring `azure` ignoring case (e.g., `Azure Functions`, `AzureAD`)

#### Scenario: Soft-deleted challenges are excluded
- **WHEN** a client sends `GET /challenges` and at least one row has a non-null `deleted_at`
- **THEN** that row is NOT included in `items` and does NOT contribute to `total`

#### Scenario: Invalid query rejected
- **WHEN** a client sends `GET /challenges?status=archived` or `GET /challenges?limit=500`
- **THEN** the server responds with HTTP 400 listing the offending parameter

### Requirement: Get challenge detail endpoint
The system SHALL expose `GET /challenges/:id` as a public (no-auth) endpoint returning a single challenge by id. Soft-deleted rows SHALL be treated as not found.

#### Scenario: Existing challenge returned
- **WHEN** a client sends `GET /challenges/:id` where the id matches a non-deleted row
- **THEN** the server responds with HTTP 200 and the full challenge DTO including `enrollments_count: 0`

#### Scenario: Non-existent or soft-deleted id returns 404
- **WHEN** a client sends `GET /challenges/:id` and either no row matches the id or the row has a non-null `deleted_at`
- **THEN** the server responds with HTTP 404

### Requirement: Update challenge endpoint (owner only)
The system SHALL expose `PATCH /challenges/:id`, protected by `JwtAuthGuard`, which partially updates a challenge that the authenticated user owns. Mutable fields are `title`, `description`, `required_skills`, `deadline`, `max_enrollments`, and `status`. Immutable fields are `id`, `owner_id`, `created_at`, and `deleted_at`.

#### Scenario: Owner updates their challenge
- **WHEN** the authenticated user is the `owner_id` of the target challenge and sends `PATCH /challenges/:id` with a partial valid body
- **THEN** the server applies the changes, returns HTTP 200 with the updated DTO

#### Scenario: Non-owner blocked
- **WHEN** an authenticated user that is NOT the `owner_id` sends `PATCH /challenges/:id`
- **THEN** the server responds with HTTP 403 and does NOT modify the row

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `PATCH /challenges/:id` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: Soft-deleted target returns 404
- **WHEN** an authenticated user sends `PATCH /challenges/:id` for an id whose row has a non-null `deleted_at`
- **THEN** the server responds with HTTP 404

### Requirement: Soft-delete challenge endpoint (owner only)
The system SHALL expose `DELETE /challenges/:id`, protected by `JwtAuthGuard`, which sets `deleted_at = now()` on the target challenge when the authenticated user is the owner. The row SHALL NOT be physically removed.

#### Scenario: Owner soft-deletes their challenge
- **WHEN** the owner sends `DELETE /challenges/:id` with a valid JWT
- **THEN** the server sets `deleted_at` to the current timestamp, responds with HTTP 204, and the row is no longer returned by `GET /challenges` or `GET /challenges/:id`

#### Scenario: Non-owner blocked
- **WHEN** an authenticated non-owner sends `DELETE /challenges/:id`
- **THEN** the server responds with HTTP 403 and `deleted_at` remains unchanged

#### Scenario: Already-deleted target returns 404
- **WHEN** any authenticated user sends `DELETE /challenges/:id` for an id whose row already has a non-null `deleted_at`
- **THEN** the server responds with HTTP 404

### Requirement: Global request validation
The system SHALL register a global `ValidationPipe` configured with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. Request bodies and query parameters SHALL be validated against the DTOs annotated with `class-validator` decorators.

#### Scenario: Numeric query strings transformed
- **WHEN** a client sends `GET /challenges?page=2&limit=10`
- **THEN** the controller receives `page` and `limit` as numbers, not strings

#### Scenario: Unknown fields stripped or rejected
- **WHEN** a client sends a body with a property that is not declared in the DTO
- **THEN** the server responds with HTTP 400

### Requirement: Challenge DTO shape
The system SHALL serialize challenges to clients using a single DTO with the fields: `id` (uuid), `ownerId` (uuid), `title` (string), `description` (string, markdown), `requiredSkills` (string array), `deadline` (ISO 8601 string), `maxEnrollments` (integer or null), `status` (`open` or `closed`), `createdAt` (ISO 8601 string), and `enrollmentsCount` (integer; hard-coded to `0` in Phase 2 and populated by the enrollment service in Phase 3). Database column names use snake_case; DTO properties use camelCase.

#### Scenario: DTO uses camelCase
- **WHEN** any challenge endpoint serializes a row
- **THEN** the JSON response uses `ownerId`, `requiredSkills`, `maxEnrollments`, `createdAt`, and `enrollmentsCount` (camelCase) regardless of the underlying column names

#### Scenario: enrollmentsCount placeholder
- **WHEN** any challenge endpoint returns a challenge in Phase 2
- **THEN** `enrollmentsCount` is included in the payload with the integer value `0`

