## ADDED Requirements

### Requirement: thumbnail_url and invalidation columns
The `submissions` table SHALL gain two new nullable columns via TypeORM migrations:
- `thumbnail_url` (`text`, nullable) — populated asynchronously after a successful file upload by the thumbnail microservice flow described in [backend-thumbnail-service](../backend-thumbnail-service/spec.md). URL-mode submissions SHALL leave this column NULL.
- `invalidated_at` (`timestamptz`, nullable) — set by the submission-scanner invalidate webhook described in [backend-functions](../backend-functions/spec.md) when a file fails server-side validation.
- `invalid_reason` (`text`, nullable) — short machine-readable reason string (`size_exceeded`, `unsupported_mime`, etc.) accompanying `invalidated_at`.

The Submission response DTO SHALL expose all three as camelCase fields (`thumbnailUrl`, `invalidatedAt`, `invalidReason`). A submission row whose `invalidated_at` is non-null SHALL still be returned by list and detail endpoints; the FE decides how to render it.

#### Scenario: Migration adds the three columns
- **WHEN** the migration runs against a database that already has the Phase-4 `submissions` table
- **THEN** the three new nullable columns are present with the types listed above and the migration's `down()` drops them

#### Scenario: DTO includes new fields
- **WHEN** the FE fetches a submission via `GET /enrollments/:id/submissions`
- **THEN** every item includes `thumbnailUrl`, `invalidatedAt`, and `invalidReason` properties (each potentially null)

### Requirement: POST /internal/submissions/:id/invalidate endpoint
The system SHALL expose an internal-only endpoint `POST /internal/submissions/:id/invalidate` that accepts JSON body `{ reason: string }` and applies the following effects in a single transaction:
1. `UPDATE submissions SET invalidated_at = NOW(), invalid_reason = $1 WHERE id = $2`.
2. `UPDATE enrollments SET status = 'in_progress' WHERE id = (SELECT enrollment_id FROM submissions WHERE id = $2)` — only if the enrollment's current status is `submitted` (so an already-approved or already-rejected enrollment is not regressed).

Authentication SHALL be a shared-secret header check: `X-Internal-Secret` MUST equal `process.env.SCANNER_SHARED_SECRET`. There SHALL NOT be a JWT requirement. The route SHALL NOT be registered through APIM; it is reachable only over the VNet from the Function App. The controller SHALL respond with HTTP 401 if the header is missing or incorrect, HTTP 404 if no submission with that id exists, and HTTP 200 with an empty body on success.

#### Scenario: Valid call invalidates the submission and reverts enrollment
- **WHEN** the scanner POSTs `{ reason: "unsupported_mime" }` with the correct `X-Internal-Secret` against a submission whose enrollment is in `submitted` state
- **THEN** the response is HTTP 200; the submission row has `invalidated_at` set and `invalid_reason = "unsupported_mime"`; the enrollment row's status is now `in_progress`

#### Scenario: Wrong shared secret is rejected
- **WHEN** any client calls the endpoint with `X-Internal-Secret: wrong`
- **THEN** the response is HTTP 401 and no database row changes

#### Scenario: Missing shared secret header is rejected
- **WHEN** a request omits the `X-Internal-Secret` header
- **THEN** the response is HTTP 401

#### Scenario: Approved enrollment is not regressed
- **WHEN** the scanner invalidates a submission whose enrollment is already in `approved` state
- **THEN** the submission row's invalidation columns ARE updated but the enrollment status remains `approved` (the invalidation lands, but the user already passed)

#### Scenario: Unknown submission id returns 404
- **WHEN** the scanner posts against a submission id that does not exist
- **THEN** the response is HTTP 404 and no rows change

### Requirement: File submission triggers asynchronous thumbnail generation
After a successful `POST /enrollments/:id/submissions` multipart (file) submission, `SubmissionsService.createFileSubmission` SHALL schedule a call to the thumbnail microservice via `setImmediate` (or an equivalent post-response hook). The synchronous HTTP response SHALL be returned to the caller before the thumbnail call is made. The thumbnail call's eventual success SHALL `UPDATE submissions SET thumbnail_url = $1 WHERE id = $2`. The thumbnail call's failure SHALL leave `thumbnail_url` NULL and log at `warn` level.

URL submissions SHALL NOT trigger a thumbnail call.

#### Scenario: File submission response is not blocked
- **WHEN** a file is submitted and the thumbnail service is artificially slow (10s)
- **THEN** the FE receives its HTTP 201 within the normal SLA (under 1 second) and the eventual `thumbnail_url` update is observable via a subsequent `GET /enrollments/:id/submissions` call

#### Scenario: URL submission skips the thumbnail call
- **WHEN** a URL submission succeeds
- **THEN** `ThumbnailClient.requestThumbnail` is not invoked and `thumbnail_url` stays NULL
