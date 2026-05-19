## MODIFIED Requirements

### Requirement: Create challenge endpoint
The system SHALL expose `POST /challenges`, protected by `JwtAuthGuard`, which creates a challenge owned by the authenticated user. The request body SHALL accept `title` (non-empty string), `description` (non-empty string), `required_skills` (string array; may be empty), `deadline` (ISO 8601 date-time in the future), and `max_enrollments` (positive integer, optional). The response SHALL be the full challenge DTO with HTTP 201. The response's `enrollmentsCount` field SHALL reflect the current count of non-`rejected` enrollments for the challenge (always `0` immediately after creation because no enrollments exist yet).

#### Scenario: Authenticated user creates a challenge
- **WHEN** a client sends `POST /challenges` with a valid JWT and a valid body
- **THEN** the server inserts a new row with `owner_id` set to the JWT's `sub`, `status` defaulted to `open`, and responds with HTTP 201 and the created challenge as JSON including `id`, `owner_id`, `title`, `description`, `required_skills`, `deadline`, `max_enrollments`, `status`, `created_at`, and `enrollments_count: 0` (no enrollments exist yet for a freshly created challenge)

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
The system SHALL expose `GET /challenges` as a public (no-auth) endpoint returning a paginated list of challenges that are NOT soft-deleted. The endpoint SHALL accept `?page` (positive integer, defaults to 1), `?limit` (1–100, defaults to 20), `?status` (one of `open` or `closed`, optional), and `?skill` (string, optional, case-insensitive substring match against any element of `required_skills`). The response SHALL be `{ items: ChallengeDto[], page: number, limit: number, total: number }`. Each item SHALL include `enrollments_count` (number) computed at query time as the count of `enrollments` rows for that challenge whose `status` is NOT `rejected`.

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

#### Scenario: enrollmentsCount reflects active enrollments
- **WHEN** a challenge has 4 enrollments with statuses `in_progress`, `in_progress`, `submitted`, and `rejected`
- **THEN** the item for that challenge in `GET /challenges` has `enrollmentsCount: 3` (the rejected enrollment is excluded)

#### Scenario: enrollmentsCount is zero for a challenge with no enrollments
- **WHEN** a challenge has no rows in the `enrollments` table
- **THEN** the item for that challenge in `GET /challenges` has `enrollmentsCount: 0`

### Requirement: Get challenge detail endpoint
The system SHALL expose `GET /challenges/:id` as a public (no-auth) endpoint returning a single challenge by id. Soft-deleted rows SHALL be treated as not found. The response's `enrollmentsCount` field SHALL be computed at query time as the count of `enrollments` rows for that challenge whose `status` is NOT `rejected`.

#### Scenario: Existing challenge returned
- **WHEN** a client sends `GET /challenges/:id` where the id matches a non-deleted row
- **THEN** the server responds with HTTP 200 and the full challenge DTO including the current `enrollmentsCount` (the count of non-`rejected` enrollments, or `0` if there are none)

#### Scenario: Non-existent or soft-deleted id returns 404
- **WHEN** a client sends `GET /challenges/:id` and either no row matches the id or the row has a non-null `deleted_at`
- **THEN** the server responds with HTTP 404

#### Scenario: enrollmentsCount on detail reflects active enrollments
- **WHEN** a challenge has 2 `in_progress`, 1 `approved`, and 1 `rejected` enrollments
- **THEN** `GET /challenges/:id` returns `enrollmentsCount: 3`

### Requirement: Challenge DTO shape
The system SHALL serialize challenges to clients using a single DTO with the fields: `id` (uuid), `ownerId` (uuid), `title` (string), `description` (string, markdown), `requiredSkills` (string array), `deadline` (ISO 8601 string), `maxEnrollments` (integer or null), `status` (`open` or `closed`), `createdAt` (ISO 8601 string), and `enrollmentsCount` (integer; the count of `enrollments` rows for the challenge whose `status` is NOT `rejected`, computed at query time). Database column names use snake_case; DTO properties use camelCase.

#### Scenario: DTO uses camelCase
- **WHEN** any challenge endpoint serializes a row
- **THEN** the JSON response uses `ownerId`, `requiredSkills`, `maxEnrollments`, `createdAt`, and `enrollmentsCount` (camelCase) regardless of the underlying column names

#### Scenario: enrollmentsCount reflects active enrollments
- **WHEN** any challenge endpoint returns a challenge that has rows in the `enrollments` table
- **THEN** `enrollmentsCount` equals the count of enrollments for that challenge whose `status` is NOT `rejected`

#### Scenario: enrollmentsCount is zero when there are no enrollments
- **WHEN** any challenge endpoint returns a challenge with no rows in the `enrollments` table
- **THEN** `enrollmentsCount` is `0`
