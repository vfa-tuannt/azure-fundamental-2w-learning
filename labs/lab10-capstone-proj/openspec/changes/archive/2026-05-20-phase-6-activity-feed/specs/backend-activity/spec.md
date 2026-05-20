## ADDED Requirements

### Requirement: Activity event persistence
The system SHALL persist activity events in an `activity_events` table with the following columns: `id` (uuid, primary key), `user_id` (uuid, not null, foreign key to `users.id` with `ON DELETE RESTRICT`), `event_type` (Postgres enum `activity_event_type` with values `challenge_created`, `enrolled`, `submitted`, `approved`, `rejected`), `payload` (jsonb, not null, defaults to `'{}'::jsonb`), and `created_at` (timestamptz, not null, defaults to `now()`). The table SHALL be created via a TypeORM migration that also adds two indexes: one on `(created_at DESC)` named `IDX_activity_events_created_at` and one composite on `(user_id, created_at DESC)` named `IDX_activity_events_user_id_created_at`. The migration's `down()` method SHALL drop the table first and then drop the enum.

#### Scenario: Migration creates table, enum, and both indexes
- **WHEN** `yarn migration:run` is executed against a database that already contains the `users`, `challenges`, `enrollments`, and `submissions` tables
- **THEN** the `activity_event_type` enum is created with values `challenge_created`, `enrolled`, `submitted`, `approved`, `rejected`; the `activity_events` table is created with all required columns; and both `IDX_activity_events_created_at` and `IDX_activity_events_user_id_created_at` indexes exist

#### Scenario: Migration down rolls back cleanly
- **WHEN** `yarn migration:revert` is run against a database where the activity migration has been applied
- **THEN** the `activity_events` table is dropped, then the `activity_event_type` enum is dropped, and re-running `yarn migration:run` SHALL succeed

#### Scenario: Inserting a row with an unknown event_type is blocked
- **WHEN** the application attempts to insert an `activity_events` row with `event_type = 'commented'` (a value not in the enum)
- **THEN** the insert fails with an enum-violation error

#### Scenario: Deleting a referenced user is blocked
- **WHEN** the application attempts to hard-delete a `users` row that is referenced by at least one `activity_events.user_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

### Requirement: ActivityService write API
The system SHALL expose a `record(event)` method on `ActivityService` that accepts `{ userId: string, type: ActivityEventType, payload: object }` and inserts one row into `activity_events`. The method SHALL be called by domain services (challenges, enrollments, submissions, reviews) **after** their originating database transaction has committed. The recording call SHALL NOT participate in the originating transaction; a failed insert SHALL be logged at `error` level with the originating `userId`, `type`, and the underlying error, but the originating action SHALL still be reported as successful to the caller.

#### Scenario: Successful record inserts one row
- **WHEN** `activityService.record({ userId, type: 'challenge_created', payload: { challengeId, challengeTitle } })` is called and the database is healthy
- **THEN** exactly one new row is present in `activity_events` with the supplied values and `created_at` set to the current server time

#### Scenario: Failed record does not propagate the error
- **WHEN** the underlying database insert fails (e.g., connection lost) during a call to `activityService.record(...)`
- **THEN** the method does NOT throw to the caller, the error is emitted via the NestJS logger at `error` level with context (`userId`, `type`), and the caller's already-committed transaction remains committed

#### Scenario: Originating transaction has committed before record is called
- **WHEN** `ChallengesService.create(...)` finishes its insert transaction successfully and then calls `activityService.record(...)`
- **THEN** the `challenges` row is visible in the database before the `activity_events` insert begins, so the `payload.challengeId` is a known-good FK target

### Requirement: List recent activity endpoint
The system SHALL expose `GET /activity/recent` which returns the 50 most recent activity events across all users, ordered by `created_at DESC`. The endpoint SHALL be publicly accessible (no `Authorization` header required) and SHALL respond with HTTP 200 and an array of activity DTOs.

#### Scenario: Public unauthenticated request succeeds
- **WHEN** a client sends `GET /activity/recent` with no `Authorization` header
- **THEN** the server responds with HTTP 200 and an array of up to 50 activity DTOs

#### Scenario: Authenticated request also succeeds
- **WHEN** a client sends `GET /activity/recent` with a valid `Authorization: Bearer <jwt>` header
- **THEN** the server responds with HTTP 200 and the same DTO shape as the unauthenticated request

#### Scenario: Events ordered newest-first
- **WHEN** the database contains events spanning multiple days
- **THEN** the response array is sorted by `created_at` descending, so index 0 is the most recent event

#### Scenario: Result limited to 50 rows
- **WHEN** the database contains 200 events
- **THEN** the response array has exactly 50 items, all the most recent

#### Scenario: Empty database returns empty array
- **WHEN** the database has zero activity events
- **THEN** the server responds with HTTP 200 and an empty array, NOT a 404

### Requirement: List my activity endpoint
The system SHALL expose `GET /activity/me`, protected by `JwtAuthGuard`, which returns the 50 most recent activity events whose `user_id` equals the caller's JWT `sub`, ordered by `created_at DESC`.

#### Scenario: Authenticated caller receives only their own events
- **WHEN** an authenticated user sends `GET /activity/me`
- **THEN** the server responds with HTTP 200 and an array of up to 50 activity DTOs each having `user.id` equal to the caller's id and ordered newest-first

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /activity/me` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: User with no events
- **WHEN** an authenticated user who has performed no recorded actions sends `GET /activity/me`
- **THEN** the server responds with HTTP 200 and an empty array

#### Scenario: Result limited to 50 rows for one user
- **WHEN** the authenticated user has 75 activity events in the database
- **THEN** the response array has exactly 50 items, all the most recent ones for that user

### Requirement: Activity event DTO shape
The system SHALL serialize each activity event to clients using the DTO `{ id (uuid), type (one of challenge_created|enrolled|submitted|approved|rejected), payload (object), createdAt (ISO 8601 string), user: { id (uuid), name (string), avatarUrl (string | null) } }`. The embedded `user` object SHALL be resolved at read time via a `LEFT JOIN users ON users.id = activity_events.user_id` so name and avatar updates are reflected throughout the feed without rewriting historical events. The DTO SHALL NOT include the user's email or any other field beyond the three named above on the embedded user object. The `payload` field SHALL contain only the fields defined for the event type by the "Activity payload contracts" requirement.

#### Scenario: DTO embeds actor identity without email
- **WHEN** any activity endpoint serializes an event
- **THEN** the JSON response includes a `user` object with exactly the keys `id`, `name`, and `avatarUrl`, and does NOT include `email`

#### Scenario: User updates reflected in feed
- **WHEN** an event was recorded one week ago and the user has since updated their `name`
- **THEN** the next `GET /activity/recent` response shows the new name on the embedded `user` object for that event

#### Scenario: createdAt is an ISO 8601 string
- **WHEN** any activity endpoint serializes an event with `created_at = 2026-05-19 03:14:15.000+07`
- **THEN** the DTO's `createdAt` field is a string parseable by `new Date(...)` and reflects the same instant

#### Scenario: DTO uses camelCase
- **WHEN** any activity endpoint serializes a row
- **THEN** the JSON response uses `createdAt` and `avatarUrl` (camelCase) regardless of the underlying snake_case column names

### Requirement: Activity payload contracts
The system SHALL store and serialize the `payload` field for each event type using the exact fields below; payloads SHALL NOT include unrelated fields:

| event_type          | payload fields                                                                                              |
|---------------------|-------------------------------------------------------------------------------------------------------------|
| `challenge_created` | `{ challengeId: string, challengeTitle: string }`                                                            |
| `enrolled`          | `{ challengeId: string, challengeTitle: string, enrollmentId: string }`                                      |
| `submitted`         | `{ submissionId: string, enrollmentId: string, challengeId: string, challengeTitle: string, kind: 'file' \| 'url' }` |
| `approved`          | `{ submissionId: string, enrollmentId: string, challengeId: string, challengeTitle: string, reviewerId: string }` |
| `rejected`          | `{ submissionId: string, enrollmentId: string, challengeId: string, challengeTitle: string, reviewerId: string, rejectionReason: string \| null }` |

The `challengeTitle` is captured at event-record time so the timeline remains stable even if the challenge is later renamed or soft-deleted.

#### Scenario: challenge_created payload shape
- **WHEN** a `challenge_created` event is serialized
- **THEN** the `payload` object contains exactly the keys `challengeId` and `challengeTitle`, both strings

#### Scenario: enrolled payload shape
- **WHEN** an `enrolled` event is serialized
- **THEN** the `payload` object contains exactly the keys `challengeId`, `challengeTitle`, and `enrollmentId`

#### Scenario: submitted payload includes submission kind
- **WHEN** a `submitted` event for a file upload is serialized
- **THEN** the `payload.kind` field equals the string `"file"`; for an external-URL submission, `payload.kind` equals `"url"`

#### Scenario: approved payload includes reviewer
- **WHEN** an `approved` event is serialized
- **THEN** the `payload.reviewerId` is the uuid of the challenge owner who approved the submission

#### Scenario: rejected payload includes optional reason
- **WHEN** a `rejected` event is serialized for a reject action that supplied a reason
- **THEN** `payload.rejectionReason` is a non-empty string; when the reject action omitted the reason, `payload.rejectionReason` is `null`

#### Scenario: Stable title in payload survives challenge rename
- **WHEN** a `challenge_created` event was recorded with `payload.challengeTitle = "Learn Bicep"` and the challenge owner later renames the challenge to "Learn Bicep v2"
- **THEN** the activity endpoint's response for that event still shows `payload.challengeTitle = "Learn Bicep"`

### Requirement: Soft-deleted challenges remain in the feed
The system SHALL continue to return activity events whose target challenge has been soft-deleted (`deleted_at IS NOT NULL`). The `payload.challengeTitle` is preserved at event-record time and SHALL remain whatever value was captured then. The FE is responsible for handling clicks on `<router-link>`s into soft-deleted challenges (which produce HTTP 404 from `GET /challenges/:id`).

#### Scenario: Event for soft-deleted challenge still appears
- **WHEN** a user creates challenge X, the event is recorded, and the user later soft-deletes X; then a client requests `GET /activity/recent`
- **THEN** the response includes the `challenge_created` event for X with its original `challengeTitle` and `challengeId`
