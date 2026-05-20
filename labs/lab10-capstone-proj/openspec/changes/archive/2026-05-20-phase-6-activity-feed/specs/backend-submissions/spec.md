## ADDED Requirements

### Requirement: Successful submission emits a submitted activity event
The system SHALL record one `submitted` activity event after every successful `POST /enrollments/:id/submissions` request. The event SHALL be recorded against the submitter's id (the request's JWT `sub`, which equals the enrollment's `user_id`) with `payload = { submissionId, enrollmentId, challengeId, challengeTitle, kind }` where `kind` is the string `'file'` when the request was a multipart file upload and `'url'` when the request was a JSON `{ externalUrl, notes? }` body. Recording SHALL occur **after** the originating database transaction (the submission insert and the enrollment status flip) has committed. A failure of the activity insert SHALL NOT roll back the originating transaction or surface as an error to the API caller.

#### Scenario: Successful file submission records event with kind=file
- **WHEN** an authenticated enrollment owner sends `POST /enrollments/:id/submissions` as multipart with a valid file and the server responds with HTTP 201
- **THEN** exactly one new row exists in `activity_events` with `event_type = 'submitted'`, `user_id` equal to the submitter, and `payload.kind = 'file'`; `payload` also contains `submissionId`, `enrollmentId`, `challengeId`, and `challengeTitle`

#### Scenario: Successful URL submission records event with kind=url
- **WHEN** an authenticated enrollment owner sends `POST /enrollments/:id/submissions` with JSON `{ externalUrl, notes }` and the server responds with HTTP 201
- **THEN** exactly one new row exists in `activity_events` with `event_type = 'submitted'` and `payload.kind = 'url'`

#### Scenario: Failed submission does not record an event
- **WHEN** `POST /enrollments/:id/submissions` fails with HTTP 400, 401, 403, 404, 409, or 422
- **THEN** no new row is inserted into `activity_events` as a result of that request

#### Scenario: Activity insert failure does not break the API response
- **WHEN** `POST /enrollments/:id/submissions` succeeds but the subsequent activity insert fails
- **THEN** the API caller still receives HTTP 201; the activity failure is logged at `error` level
