## ADDED Requirements

### Requirement: Successful approval emits an approved activity event
The system SHALL record one `approved` activity event after every successful `POST /submissions/:id/approve` request. The event SHALL be recorded against the **submitter's** id (the user whose enrollment was just approved — `enrollment.user_id`), NOT the challenge owner's id, with `payload = { submissionId, enrollmentId, challengeId, challengeTitle, reviewerId }` where `reviewerId` is the JWT `sub` of the calling challenge owner. Recording SHALL occur **after** the originating database transaction has committed. A failure of the activity insert SHALL NOT roll back the originating transaction or surface as an error to the API caller.

#### Scenario: Successful approve records event for submitter
- **WHEN** an authenticated challenge owner sends `POST /submissions/:id/approve` and the server responds with HTTP 200
- **THEN** exactly one new row exists in `activity_events` with `event_type = 'approved'`, `user_id` equal to the **submitter's** id (NOT the reviewer's), and `payload.reviewerId` equal to the reviewing owner's id

#### Scenario: Failed approve does not record an event
- **WHEN** `POST /submissions/:id/approve` fails with HTTP 401, 403, 404, or 409
- **THEN** no new row is inserted into `activity_events` as a result of that request

#### Scenario: Approval payload contains all required fields
- **WHEN** a successful approve emits an event
- **THEN** the `payload` object contains exactly the keys `submissionId`, `enrollmentId`, `challengeId`, `challengeTitle`, and `reviewerId`, each a string

### Requirement: Successful rejection emits a rejected activity event
The system SHALL record one `rejected` activity event after every successful `POST /submissions/:id/reject` request. The event SHALL be recorded against the **submitter's** id with `payload = { submissionId, enrollmentId, challengeId, challengeTitle, reviewerId, rejectionReason }` where `rejectionReason` mirrors the same normalised value that was stored on the submission row (a non-empty string when the reject body supplied one, otherwise `null`). Recording SHALL occur **after** the originating database transaction has committed. A failure of the activity insert SHALL NOT roll back the originating transaction or surface as an error to the API caller.

#### Scenario: Successful reject with reason records event with reason
- **WHEN** an authenticated challenge owner sends `POST /submissions/:id/reject` with body `{ reason: "Output incomplete" }` and the server responds with HTTP 200
- **THEN** exactly one new row exists in `activity_events` with `event_type = 'rejected'`, `user_id` equal to the submitter's id, and `payload.rejectionReason = "Output incomplete"`

#### Scenario: Successful reject without reason records event with null reason
- **WHEN** an authenticated challenge owner sends `POST /submissions/:id/reject` with body `{}` and the server responds with HTTP 200
- **THEN** exactly one new row exists in `activity_events` with `event_type = 'rejected'` and `payload.rejectionReason = null`

#### Scenario: Failed reject does not record an event
- **WHEN** `POST /submissions/:id/reject` fails with HTTP 400, 401, 403, 404, or 409
- **THEN** no new row is inserted into `activity_events` as a result of that request

#### Scenario: Rejection payload contains all required fields
- **WHEN** a successful reject emits an event
- **THEN** the `payload` object contains exactly the keys `submissionId`, `enrollmentId`, `challengeId`, `challengeTitle`, `reviewerId`, and `rejectionReason`
