## MODIFIED Requirements

### Requirement: Activity event persistence
The system SHALL persist activity events in the Cosmos DB Serverless container `activity_events` (database `skillplatform`, partition key `/userId`). Each document SHALL have shape `{ id: <uuid v4>, userId: <uuid>, eventType: "challenge_created" | "enrolled" | "submitted" | "approved" | "rejected", payload: <object>, createdAt: <ISO 8601 string> }`. The container SHALL have a composite index `[ { path: "/userId", order: "ascending" }, { path: "/createdAt", order: "descending" } ]` defined in Terraform to support per-user time-ordered reads efficiently. The legacy Postgres `activity_events` table SHALL be dropped via a TypeORM migration whose `down()` method recreates the table by replaying the original Phase-6 schema (table + two indexes + enum) so a rollback to Postgres remains feasible — but the application code only ever reads/writes the Cosmos container.

#### Scenario: Cosmos container exists with composite index
- **WHEN** an operator inspects the `activity_events` container via the Data Explorer
- **THEN** the partition key is `/userId` and the composite index `[ /userId ASC, /createdAt DESC ]` is listed under Indexing Policy

#### Scenario: Postgres table is dropped on apply
- **WHEN** the cutover TypeORM migration `DropActivityEventsTable` is run against a database that has the Phase-6 table
- **THEN** the `activity_events` table no longer exists and `\d activity_events` in `psql` returns "Did not find any relation"

#### Scenario: Rollback recreates Phase-6 table
- **WHEN** `yarn migration:revert` is run against the cutover migration
- **THEN** the `activity_events` table, both indexes, and the enum are recreated identically to the Phase-6 layout

#### Scenario: Inserting a document with unknown eventType is blocked at the application layer
- **WHEN** the application attempts to insert a document with `eventType = "commented"`
- **THEN** the `ActivityEventType` TypeScript discriminated union prevents the call at compile time; if the value reaches the repository at runtime via untrusted data, the repository SHALL throw before issuing the Cosmos write

### Requirement: ActivityService write API
The system SHALL expose a `record(event)` method on `ActivityService` that accepts `{ userId: string, type: ActivityEventType, payload: object }` and inserts one document into the Cosmos `activity_events` container via the `ActivityRepository` port. The repository binding in production SHALL be the `CosmosActivityRepository`; the binding in local development MAY remain `PostgresActivityRepository` while the local Postgres table still exists, but production code paths SHALL go through Cosmos exclusively. The method SHALL be called by domain services (challenges, enrollments, submissions, reviews) **after** their originating database transaction has committed. The recording call SHALL NOT participate in the originating transaction; a failed insert SHALL be logged at `error` level with the originating `userId`, `type`, and the underlying error, but the originating action SHALL still be reported as successful to the caller.

#### Scenario: Successful record inserts one document
- **WHEN** `activityService.record({ userId, type: 'challenge_created', payload: { challengeId, challengeTitle } })` is called against a healthy Cosmos account
- **THEN** exactly one new document is present in `activity_events` with the supplied values and `createdAt` set to the current UTC time

#### Scenario: Failed record does not propagate the error
- **WHEN** the underlying Cosmos write fails (e.g., 429 throttle, transient 503) during a call to `activityService.record(...)`
- **THEN** the method does NOT throw to the caller, the error is emitted via the NestJS logger at `error` level with context (`userId`, `type`), and the caller's already-committed Postgres transaction remains committed

#### Scenario: Originating transaction has committed before record is called
- **WHEN** `ChallengesService.create(...)` finishes its Postgres insert transaction successfully and then calls `activityService.record(...)`
- **THEN** the `challenges` row is visible in Postgres before the Cosmos write begins, so the `payload.challengeId` is a known-good reference

### Requirement: List recent activity endpoint
The system SHALL expose `GET /activity/recent` which returns the 50 most recent activity events across all users, ordered by `createdAt DESC`. The endpoint SHALL be publicly accessible (no `Authorization` header required) and SHALL respond with HTTP 200 and an array of activity DTOs. Reads SHALL be cross-partition Cosmos queries limited by `TOP 50` server-side.

#### Scenario: Public unauthenticated request succeeds
- **WHEN** a client sends `GET /activity/recent` with no `Authorization` header
- **THEN** the server responds with HTTP 200 and an array of up to 50 activity DTOs sourced from Cosmos

#### Scenario: Authenticated request also succeeds
- **WHEN** a client sends `GET /activity/recent` with a valid `Authorization: Bearer <jwt>` header
- **THEN** the server responds with HTTP 200 and the same DTO shape as the unauthenticated request

#### Scenario: Events ordered newest-first
- **WHEN** the container contains events spanning multiple days
- **THEN** the response array is sorted by `createdAt` descending, so index 0 is the most recent event

#### Scenario: Result limited to 50 documents
- **WHEN** the container contains 200 events
- **THEN** the response array has exactly 50 items, all the most recent

#### Scenario: Empty container returns empty array
- **WHEN** the container has zero documents
- **THEN** the server responds with HTTP 200 and an empty array, NOT a 404

### Requirement: List my activity endpoint
The system SHALL expose `GET /activity/me`, protected by `JwtAuthGuard`, which returns the 50 most recent activity events whose `userId` equals the caller's JWT `sub`, ordered by `createdAt DESC`. The read SHALL be a single-partition Cosmos query keyed on `userId` (no cross-partition fan-out).

#### Scenario: Authenticated caller receives only their own events
- **WHEN** an authenticated user sends `GET /activity/me`
- **THEN** the server responds with HTTP 200 and an array of up to 50 activity DTOs each having `user.id` equal to the caller's id and ordered newest-first

#### Scenario: Read is single-partition
- **WHEN** the request is served
- **THEN** the Cosmos SDK call sets `partitionKey` to the caller's `userId` (verifiable in App Insights dependency telemetry as `x-ms-documentdb-query-enablecrosspartition: false` or by RU cost staying low under load)

#### Scenario: Unauthenticated request rejected
- **WHEN** a client sends `GET /activity/me` without an `Authorization` header
- **THEN** the server responds with HTTP 401

#### Scenario: User with no events
- **WHEN** an authenticated user who has performed no recorded actions sends `GET /activity/me`
- **THEN** the server responds with HTTP 200 and an empty array

#### Scenario: Result limited to 50 documents for one user
- **WHEN** the authenticated user has 75 activity documents in the container
- **THEN** the response array has exactly 50 items, all the most recent ones for that user

### Requirement: Activity event DTO shape
The system SHALL serialize each activity event to clients using the DTO `{ id (uuid), type (one of challenge_created|enrolled|submitted|approved|rejected), payload (object), createdAt (ISO 8601 string), user: { id (uuid), name (string), avatarUrl (string | null) } }`. The embedded `user` object SHALL be resolved at read time by a Postgres `SELECT id, name, avatar_url FROM users WHERE id = ANY($1)` lookup batched once per HTTP request (so a 50-row response performs one Postgres fetch, not 50). Cosmos documents SHALL store only `userId`; user attributes are NEVER copied into the activity document so that name / avatar updates flow through the feed without rewriting historical events. The DTO SHALL NOT include the user's email or any other field beyond the three named above on the embedded user object. The `payload` field SHALL contain only the fields defined for the event type by the "Activity payload contracts" requirement.

#### Scenario: User attributes are resolved at read time
- **WHEN** a user updates their `name` from `"A"` to `"B"` and then `GET /activity/recent` is fetched
- **THEN** all activity items whose `userId` is that user show `user.name = "B"` in the response, including historical events

#### Scenario: One Postgres lookup per response
- **WHEN** a single `GET /activity/recent` produces 50 items spanning 30 distinct users
- **THEN** exactly one `SELECT ... FROM users WHERE id = ANY($1)` is issued for that request
