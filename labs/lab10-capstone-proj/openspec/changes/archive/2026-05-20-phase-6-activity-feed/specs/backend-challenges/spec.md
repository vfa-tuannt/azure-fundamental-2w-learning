## ADDED Requirements

### Requirement: Successful challenge creation emits a challenge_created activity event
The system SHALL record one `challenge_created` activity event after every successful `POST /challenges` request. The event SHALL be recorded against the creating user's id (the request's JWT `sub`) with `payload = { challengeId, challengeTitle }` where the values come from the freshly inserted `challenges` row. Recording SHALL occur **after** the database transaction that inserted the challenge has committed, so the FK target exists. A failure of the activity insert SHALL NOT roll back the originating transaction or surface as an error to the API caller; it is logged at `error` level and swallowed.

#### Scenario: Successful create records one event
- **WHEN** an authenticated user sends `POST /challenges` and the server responds with HTTP 201 and the new challenge DTO
- **THEN** exactly one new row exists in `activity_events` with `user_id` equal to the caller's id, `event_type = 'challenge_created'`, and `payload = { challengeId: <new id>, challengeTitle: <the title from the request> }`

#### Scenario: Failed create does not record an event
- **WHEN** `POST /challenges` fails with HTTP 400 (validation), 401, or 5xx
- **THEN** no new row is inserted into `activity_events` as a result of that request

#### Scenario: Activity insert failure does not break the API response
- **WHEN** `POST /challenges` inserts the challenge successfully but the subsequent activity-events insert fails (e.g., the DB connection dropped between writes)
- **THEN** the API caller still receives HTTP 201 with the new challenge DTO; the activity failure is logged at `error` level with the originating user id and event type
