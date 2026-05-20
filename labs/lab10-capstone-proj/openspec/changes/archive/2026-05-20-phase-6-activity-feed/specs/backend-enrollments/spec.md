## ADDED Requirements

### Requirement: Successful enrollment emits an enrolled activity event
The system SHALL record one `enrolled` activity event after every successful `POST /challenges/:id/enroll` request. The event SHALL be recorded against the enrolling user's id (the request's JWT `sub`) with `payload = { challengeId, challengeTitle, enrollmentId }`. Recording SHALL occur **after** the database transaction that inserted the enrollment has committed. A failure of the activity insert SHALL NOT roll back the originating transaction or surface as an error to the API caller; it is logged at `error` level and swallowed.

The withdraw endpoint (`DELETE /challenges/:id/enroll`) SHALL NOT emit any activity event in this phase — withdraws do not appear in the feed per PRD US-014 (the event-type enum is closed and does not include `withdrawn`).

#### Scenario: Successful enroll records one event
- **WHEN** an authenticated user sends `POST /challenges/:id/enroll` and the server responds with HTTP 201
- **THEN** exactly one new row exists in `activity_events` with `user_id` equal to the caller's id, `event_type = 'enrolled'`, and `payload = { challengeId: <the id>, challengeTitle: <the title>, enrollmentId: <the new enrollment id> }`

#### Scenario: Failed enroll does not record an event
- **WHEN** `POST /challenges/:id/enroll` fails with HTTP 400, 401, 404, or 409
- **THEN** no new row is inserted into `activity_events` as a result of that request

#### Scenario: Withdraw does not record an event
- **WHEN** an authenticated user successfully sends `DELETE /challenges/:id/enroll` (returns HTTP 204)
- **THEN** no new row is inserted into `activity_events`

#### Scenario: Activity insert failure does not break the API response
- **WHEN** `POST /challenges/:id/enroll` inserts the enrollment successfully but the subsequent activity-events insert fails
- **THEN** the API caller still receives HTTP 201; the activity failure is logged at `error` level
