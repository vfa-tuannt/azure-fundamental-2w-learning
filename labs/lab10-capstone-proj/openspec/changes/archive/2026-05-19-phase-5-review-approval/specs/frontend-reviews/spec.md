## ADDED Requirements

### Requirement: Typed reviews API client
The system SHALL expose a typed API client at `frontend/src/api/reviews.ts` that wraps the backend review endpoints. The client SHALL provide three functions: `listForChallenge(challengeId: string)` returning `Promise<ChallengeSubmission[]>` (the embedded shape with `submitter` and `enrollment`), `approve(submissionId: string)` returning `Promise<Submission>`, and `reject(submissionId: string, reason?: string)` returning `Promise<Submission>`. All requests SHALL use the shared axios instance from `frontend/src/api/axios.ts` so the JWT is attached automatically.

#### Scenario: listForChallenge issues authenticated GET
- **WHEN** the FE calls `listForChallenge(challengeId)`
- **THEN** the client sends a `GET /challenges/:id/submissions` request and resolves with `ChallengeSubmission[]` ordered newest-first

#### Scenario: approve sends POST with no body
- **WHEN** the FE calls `approve(submissionId)`
- **THEN** the client sends a `POST /submissions/:id/approve` request with no JSON body and resolves with the updated `Submission` DTO

#### Scenario: reject sends POST with JSON reason
- **WHEN** the FE calls `reject(submissionId, "Output is missing the required diagrams")`
- **THEN** the client sends a `POST /submissions/:id/reject` request with body `{ reason: "Output is missing the required diagrams" }` and resolves with the updated `Submission` DTO

#### Scenario: reject without reason omits the field
- **WHEN** the FE calls `reject(submissionId)` (no reason argument)
- **THEN** the client sends a `POST /submissions/:id/reject` request with an empty JSON body `{}` and resolves with the updated `Submission` DTO

### Requirement: Reviews Pinia store
The system SHALL provide a Pinia store at `frontend/src/stores/reviews.ts` that caches the challenge-wide submission list keyed by challenge id. The store SHALL expose state `byChallengeId: Map<string, ChallengeSubmission[]>`, `loading: boolean`, `error: string | null` and actions `loadForChallenge(challengeId)`, `approve(challengeId, submissionId)`, `reject(challengeId, submissionId, reason?)`, and `reset()`. The approve and reject actions SHALL apply an optimistic update to the row's `enrollment.status` (and `reviewedAt` / `rejectionReason` on reject), reconcile with the server response on success, and roll the row back to its pre-action state on error.

#### Scenario: loadForChallenge caches the result
- **WHEN** a component calls `reviewsStore.loadForChallenge(challengeId)` for a challenge with two submissions
- **THEN** `reviewsStore.byChallengeId.get(challengeId)` returns an array of length two until `reset()` is called

#### Scenario: approve optimistically flips enrollment status
- **WHEN** a component calls `reviewsStore.approve(challengeId, submissionId)` for a row whose `enrollment.status` is currently `submitted`
- **THEN** the row's `enrollment.status` immediately becomes `approved` in the cache before the network response returns, and remains `approved` after the response is reconciled with the server DTO

#### Scenario: reject optimistically flips enrollment status and stores reason
- **WHEN** a component calls `reviewsStore.reject(challengeId, submissionId, "Missing tests")`
- **THEN** the row's `enrollment.status` immediately becomes `rejected` in the cache, `rejectionReason` becomes `"Missing tests"`, and `reviewedAt` is set to a non-null value; after the network response returns, all three fields are reconciled with the server's canonical values

#### Scenario: failed approve rolls back the optimistic update
- **WHEN** the network call inside `reviewsStore.approve(...)` fails with HTTP 409 or 5xx
- **THEN** the row's `enrollment.status`, `reviewedAt`, and `rejectionReason` revert to their pre-action values, and the store's `error` state is set to a user-readable message

#### Scenario: reset clears all state
- **WHEN** the user logs out and the auth store calls `reviewsStore.reset()`
- **THEN** `byChallengeId` is an empty Map, `loading` is false, and `error` is null

### Requirement: Owner-only Submissions panel on challenge detail
The challenge detail view at `frontend/src/views/ChallengeDetailView.vue` SHALL render a "Submissions" panel **only** when the authenticated caller is the owner of the displayed challenge (`auth.user?.id === challenge.ownerId`). The panel SHALL display a PrimeVue `DataTable` of the challenge-scoped submissions (loaded via `reviewsStore.loadForChallenge(challengeId)` on mount when the caller is the owner) with the following columns: submitter (avatar + name), submission (file link or external URL link), notes, submitted (relative timestamp), status (PrimeVue `Tag` color-coded per enrollment status), and actions (Approve / Reject controls). The panel SHALL also display a heading with the total count.

#### Scenario: Panel hidden for non-owner authenticated user
- **WHEN** an authenticated user who is not the challenge owner views `/challenges/:id`
- **THEN** the Submissions panel is NOT rendered and no `GET /challenges/:id/submissions` request is sent

#### Scenario: Panel hidden for unauthenticated visitor
- **WHEN** an unauthenticated visitor views `/challenges/:id`
- **THEN** the Submissions panel is NOT rendered

#### Scenario: Panel visible for challenge owner
- **WHEN** the authenticated user is the challenge owner and views `/challenges/:id`
- **THEN** the Submissions panel is rendered with a DataTable populated from `reviewsStore.byChallengeId.get(challengeId)`

#### Scenario: Empty state message when no submissions exist
- **WHEN** the challenge owner views `/challenges/:id` for a challenge with zero submissions
- **THEN** the panel renders an "No submissions yet" placeholder message instead of an empty table

#### Scenario: Status badge color follows enrollment status
- **WHEN** the panel renders a row whose `enrollment.status` is `submitted`
- **THEN** the status `Tag` displays the label "Submitted" with the PrimeVue `info` severity (blue); the row for `approved` uses `success` (green); the row for `rejected` uses `danger` (red)

### Requirement: Approve and Reject action controls per row
Each row in the owner's Submissions panel SHALL render Approve and Reject action buttons **only** when the row's `enrollment.status` is `submitted`. For rows in `approved` or `rejected` state, the action cell SHALL render a "Reviewed" indicator (or be empty) instead of clickable buttons. The Approve button is a one-click action that fires `reviewsStore.approve(...)`. The Reject button toggles an inline expansion within the row containing a `Textarea` for the reason and Confirm / Cancel buttons; Confirm fires `reviewsStore.reject(challengeId, submissionId, reason)` with the textarea value, Cancel collapses the expansion.

#### Scenario: Approve and Reject visible for submitted rows
- **WHEN** the panel renders a row whose `enrollment.status` is `submitted`
- **THEN** the row's action cell contains an Approve button (green, e.g. `severity="success"`) and a Reject button (red, e.g. `severity="danger"`)

#### Scenario: Action buttons hidden for approved rows
- **WHEN** the panel renders a row whose `enrollment.status` is `approved`
- **THEN** the row's action cell does NOT contain Approve or Reject buttons

#### Scenario: Action buttons hidden for rejected rows
- **WHEN** the panel renders a row whose `enrollment.status` is `rejected`
- **THEN** the row's action cell does NOT contain Approve or Reject buttons

#### Scenario: Approve button is a one-click action
- **WHEN** the owner clicks Approve on a `submitted` row
- **THEN** the FE immediately calls `reviewsStore.approve(challengeId, submissionId)` without showing a confirmation dialog

#### Scenario: Reject button toggles inline reason expansion
- **WHEN** the owner clicks Reject on a `submitted` row
- **THEN** the row expands (or reveals an adjacent inline area) containing a PrimeVue `Textarea` labeled "Reason (optional)" and two buttons "Cancel" and "Reject"

#### Scenario: Reject confirm with a reason fires the store action
- **WHEN** the owner types "Output is missing the test plan" into the reason textarea and clicks the inline Reject Confirm button
- **THEN** the FE calls `reviewsStore.reject(challengeId, submissionId, "Output is missing the test plan")` and the expansion collapses on success

#### Scenario: Reject confirm without a reason still fires the store action
- **WHEN** the owner clicks the inline Reject Confirm button while the reason textarea is empty
- **THEN** the FE calls `reviewsStore.reject(challengeId, submissionId)` with no `reason` argument

#### Scenario: Reject Cancel collapses the expansion
- **WHEN** the owner expands the Reject controls and clicks Cancel
- **THEN** the expansion collapses, no network request is sent, and the textarea content is cleared

### Requirement: Toast feedback on review actions
The system SHALL show a PrimeVue Toast after each completed review action: a success Toast on HTTP 200, an info-or-warning Toast specifically for HTTP 409 ("Status changed elsewhere — refreshing"), and an error Toast for other failures (403, network error, 5xx). On HTTP 409 the FE SHALL ALSO call `reviewsStore.loadForChallenge(challengeId)` to reconcile state.

#### Scenario: Successful approve shows success Toast
- **WHEN** `reviewsStore.approve(...)` resolves with HTTP 200
- **THEN** the FE shows a success Toast with detail "Submission approved"

#### Scenario: Successful reject shows success Toast
- **WHEN** `reviewsStore.reject(...)` resolves with HTTP 200
- **THEN** the FE shows a success Toast with detail "Submission rejected"

#### Scenario: 409 triggers refresh
- **WHEN** an approve or reject call fails with HTTP 409
- **THEN** the FE shows a warning Toast with detail "This submission was reviewed in another tab — refreshing" and re-fetches the list with `reviewsStore.loadForChallenge(challengeId)`

#### Scenario: Forbidden response shows error Toast
- **WHEN** an approve or reject call fails with HTTP 403
- **THEN** the FE shows an error Toast indicating the action is not permitted, and the optimistic update is rolled back

#### Scenario: Network error shows retry-friendly Toast
- **WHEN** an approve or reject call fails with a network error or HTTP 5xx
- **THEN** the FE shows an error Toast indicating the action could not be completed, and the optimistic update is rolled back

### Requirement: Challenge-scoped submission types exposed in frontend types module
The system SHALL extend `frontend/src/api/types.ts` with a `ChallengeSubmission` interface that extends `Submission` with two embedded objects: `enrollment: { id: string; userId: string; status: EnrollmentStatus }` and `submitter: { id: string; name: string; email: string; avatarUrl: string | null }`. Existing types from previous phases SHALL remain unchanged.

#### Scenario: ChallengeSubmission compiles against the backend list endpoint shape
- **WHEN** `yarn type-check` runs on a frontend file that imports `ChallengeSubmission` from `@/api/types` and assigns to it the JSON response from `GET /challenges/:id/submissions`
- **THEN** TypeScript reports no error
