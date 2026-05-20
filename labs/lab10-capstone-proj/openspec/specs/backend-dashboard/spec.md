## ADDED Requirements

### Requirement: Get my stats endpoint
The system SHALL expose `GET /me/stats`, protected by `JwtAuthGuard`, which returns counts derived from the authenticated caller's domain rows. The response SHALL be the DTO `{ challengesCreated (integer ≥ 0), enrollmentsActive (integer ≥ 0), enrollmentsApproved (integer ≥ 0) }`. The endpoint SHALL be added to the existing `MeController` alongside the existing `GET /me/enrollments`.

#### Scenario: Authenticated request returns three counts
- **WHEN** an authenticated user sends `GET /me/stats`
- **THEN** the server responds with HTTP 200 and a JSON body containing exactly the keys `challengesCreated`, `enrollmentsActive`, and `enrollmentsApproved`, each a non-negative integer

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /me/stats` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: User with no domain activity
- **WHEN** an authenticated user who has not created any challenges and has no enrollments sends `GET /me/stats`
- **THEN** the server responds with HTTP 200 and the body `{ challengesCreated: 0, enrollmentsActive: 0, enrollmentsApproved: 0 }`

### Requirement: Stats computation rules
The system SHALL compute each stat from existing tables as follows:
- `challengesCreated` = `COUNT(*) FROM challenges WHERE owner_id = :userId AND deleted_at IS NULL`
- `enrollmentsActive` = `COUNT(*) FROM enrollments WHERE user_id = :userId AND status IN ('in_progress', 'submitted')`
- `enrollmentsApproved` = `COUNT(*) FROM enrollments WHERE user_id = :userId AND status = 'approved'`

Soft-deleted challenges SHALL be excluded from `challengesCreated`. Rejected enrollments SHALL NOT be counted in either active or approved buckets. The counts SHALL NOT include rows belonging to other users.

#### Scenario: Soft-deleted challenges excluded from count
- **WHEN** a user has created 3 challenges, one of which they later soft-deleted, and sends `GET /me/stats`
- **THEN** `challengesCreated` equals 2

#### Scenario: in_progress and submitted enrollments both count as active
- **WHEN** a user has one enrollment with `status = in_progress` and one with `status = submitted` (in addition to one `approved` and one `rejected`) and sends `GET /me/stats`
- **THEN** `enrollmentsActive` equals 2

#### Scenario: Only approved enrollments count as approved
- **WHEN** a user has one enrollment in each of `in_progress`, `submitted`, `approved`, `rejected` and sends `GET /me/stats`
- **THEN** `enrollmentsApproved` equals exactly 1

#### Scenario: Counts ignore other users' rows
- **WHEN** user A has 5 challenges and user B has 3 challenges, and user A sends `GET /me/stats`
- **THEN** `challengesCreated` in user A's response equals 5, not 8

#### Scenario: Stats are consistent within a single request
- **WHEN** the three counts are computed in close succession (separate `COUNT(*)` queries within one request)
- **THEN** each returned count reflects the state of its respective table at the time of its individual query; the response is best-effort consistent (we do NOT require transactional isolation across the three counts)
