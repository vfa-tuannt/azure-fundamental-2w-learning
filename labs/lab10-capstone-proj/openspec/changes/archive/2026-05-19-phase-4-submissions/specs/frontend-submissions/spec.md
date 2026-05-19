## ADDED Requirements

### Requirement: Typed submissions API client
The system SHALL expose a typed API client at `frontend/src/api/submissions.ts` that wraps the backend submission endpoints. The client SHALL provide three functions: `createFileSubmission(enrollmentId: string, file: File, notes?: string)`, `createUrlSubmission(enrollmentId: string, externalUrl: string, notes?: string)`, and `listForEnrollment(enrollmentId: string)`. All requests SHALL use the shared axios instance from `frontend/src/api/axios.ts` so the JWT is attached automatically.

#### Scenario: File submission sent as multipart
- **WHEN** the FE calls `createFileSubmission(enrollmentId, file, "my notes")`
- **THEN** the client sends a `POST /enrollments/:id/submissions` request with `Content-Type: multipart/form-data` and a body containing a `file` part and a `notes` text field, and resolves with the `Submission` DTO returned by the server

#### Scenario: External URL submission sent as JSON
- **WHEN** the FE calls `createUrlSubmission(enrollmentId, "https://example.com", "see link")`
- **THEN** the client sends a `POST /enrollments/:id/submissions` request with `Content-Type: application/json` and body `{ externalUrl: "https://example.com", notes: "see link" }`, and resolves with the `Submission` DTO

#### Scenario: List submissions returns array
- **WHEN** the FE calls `listForEnrollment(enrollmentId)`
- **THEN** the client sends a `GET /enrollments/:id/submissions` request and resolves with `Submission[]` ordered newest-first

### Requirement: Submissions Pinia store
The system SHALL provide a Pinia store at `frontend/src/stores/submissions.ts` that caches submissions keyed by enrollment id. The store SHALL expose state `byEnrollmentId: Map<string, Submission[]>`, `loading: boolean`, `error: string | null` and actions `loadForEnrollment(enrollmentId)`, `createFileSubmission(enrollmentId, file, notes?)`, `createUrlSubmission(enrollmentId, externalUrl, notes?)`, and `reset()`.

#### Scenario: loadForEnrollment caches the result
- **WHEN** a component calls `submissionsStore.loadForEnrollment(enrollmentId)` for an enrollment with two submissions
- **THEN** the store's `byEnrollmentId.get(enrollmentId)` returns an array of length two until `reset()` is called

#### Scenario: createFileSubmission updates the cache
- **WHEN** a component calls `submissionsStore.createFileSubmission(enrollmentId, file)` and the request succeeds
- **THEN** the new submission is prepended to `byEnrollmentId.get(enrollmentId)` (or a new entry is created if none existed) and the resolved promise contains the new submission

#### Scenario: createUrlSubmission updates the cache
- **WHEN** a component calls `submissionsStore.createUrlSubmission(enrollmentId, url)` and the request succeeds
- **THEN** the new submission is prepended to `byEnrollmentId.get(enrollmentId)`

#### Scenario: reset clears all state
- **WHEN** the user logs out and the auth store calls `submissionsStore.reset()`
- **THEN** `byEnrollmentId` is an empty Map, `loading` is false, and `error` is null

### Requirement: Submit Output panel on challenge detail
The challenge detail view at `frontend/src/views/ChallengeDetailView.vue` SHALL render a "Submit Output" panel **only** when the authenticated caller has an enrollment for the displayed challenge with `status === 'in_progress'`. The panel SHALL contain a mode toggle (PrimeVue `SelectButton`) with two options "File" and "External URL"; in File mode it SHALL render a PrimeVue `FileUpload` with drag-drop, `accept` restricted to the allowed extensions, max-file-size hint of 25 MB, and the built-in upload button hidden; in URL mode it SHALL render a PrimeVue `InputText` for the URL plus a `Textarea` for notes. Both modes SHALL share a single Submit button that calls the appropriate submissions store action.

#### Scenario: Panel hidden for non-enrolled visitor
- **WHEN** an authenticated user who has no enrollment for the displayed challenge views the challenge detail page
- **THEN** the Submit Output panel is NOT rendered

#### Scenario: Panel hidden for unauthenticated visitor
- **WHEN** an unauthenticated visitor views the challenge detail page
- **THEN** the Submit Output panel is NOT rendered

#### Scenario: Panel hidden for owner
- **WHEN** the authenticated user is the owner of the displayed challenge
- **THEN** the Submit Output panel is NOT rendered

#### Scenario: Panel hidden after successful submission
- **WHEN** an enrolled user with `status = in_progress` successfully submits and the FE updates `myEnrollment.status` to `submitted`
- **THEN** the Submit Output panel disappears in the same render cycle (no page reload required)

#### Scenario: File mode shows FileUpload component
- **WHEN** an enrolled user with `status = in_progress` views the panel and the toggle is set to "File"
- **THEN** the panel renders a PrimeVue `FileUpload` component restricted to PDF, PNG, JPG, ZIP, and Markdown file types, with a 25 MB maximum size hint shown to the user

#### Scenario: URL mode shows URL input
- **WHEN** an enrolled user with `status = in_progress` views the panel and the toggle is set to "External URL"
- **THEN** the panel renders a PrimeVue `InputText` for the URL and a `Textarea` for notes

### Requirement: Submit action wires to submissions store and updates UI
The Submit button in the Submit Output panel SHALL invoke `submissionsStore.createFileSubmission(...)` in File mode or `submissionsStore.createUrlSubmission(...)` in URL mode. On a successful response the FE SHALL: set the local enrollment's `status` to `submitted` in the enrollments store (so the Phase 3 button matrix swaps from `withdraw-enabled` to `terminal-submitted` without a page reload), show a success Toast, clear the form fields, and prepend the new submission to the local list. On an error response the FE SHALL show a PrimeVue Toast with a user-friendly message derived from the HTTP status code.

#### Scenario: Successful file submission flips button state
- **WHEN** an enrolled user with `status = in_progress` selects a valid file, fills optional notes, clicks Submit, and the request resolves with HTTP 201
- **THEN** a success Toast appears, the Submit Output panel disappears, the existing button matrix re-renders with the "Enrolled (Submitted)" button (disabled), and the new submission appears at the top of the My Submissions list — all without a page reload

#### Scenario: 422 error shows file-rejected Toast
- **WHEN** the user submits a file that the backend rejects with HTTP 422
- **THEN** the FE shows an error Toast whose detail includes the backend's `message` field (e.g., "File type application/x-msdownload is not allowed")

#### Scenario: 409 error shows already-submitted Toast
- **WHEN** the user submits and the backend responds with HTTP 409 (e.g., a concurrent submission won)
- **THEN** the FE shows an error Toast indicating that the enrollment is no longer in `in_progress`, and the panel state remains so the user can refresh

#### Scenario: 400 missing fields shows validation Toast
- **WHEN** the user clicks Submit in URL mode without entering a URL, or in File mode without selecting a file
- **THEN** the FE shows an error Toast indicating which field is required, and does NOT send a network request

#### Scenario: Network error preserves form state
- **WHEN** the request fails with a network error or HTTP 5xx
- **THEN** the FE shows an error Toast, the form fields retain their values, and the Submit button is re-enabled so the user can retry

### Requirement: My Submissions list on challenge detail
The challenge detail view SHALL render a "My Submissions" list **only** when the authenticated caller has an enrollment for the displayed challenge AND has at least one submission for that enrollment. Each list entry SHALL display the submission filename (parsed from `blobUrl` after the last `/` and uri-decoded, or the `externalUrl` host if it is an external URL submission), the relative submitted-at timestamp, and the notes (when non-empty). File entries SHALL render the filename as a link that opens `blobUrl` in a new tab; URL entries SHALL render the URL as a link to `externalUrl`.

#### Scenario: File submission appears with downloadable link
- **WHEN** a user has submitted `report.pdf` via file upload
- **THEN** the My Submissions list shows an entry with the text "report.pdf" as a link that opens the `blobUrl` in a new browser tab (`target="_blank" rel="noopener"`)

#### Scenario: URL submission appears with external link
- **WHEN** a user has submitted an external URL `https://github.com/u/r`
- **THEN** the My Submissions list shows an entry with the URL as a link that opens the `externalUrl` in a new browser tab

#### Scenario: Notes displayed when non-empty
- **WHEN** a submission has `notes: "See the readme"`
- **THEN** the My Submissions list entry displays "See the readme" below the link

#### Scenario: Notes hidden when empty
- **WHEN** a submission has empty notes
- **THEN** the My Submissions list entry does NOT render an empty notes block

#### Scenario: List hidden when no submissions
- **WHEN** the authenticated enrolled user has no submissions yet for the displayed challenge
- **THEN** the My Submissions list is NOT rendered (no "Empty" placeholder either — the Submit Output panel above is the call to action)

#### Scenario: List ordered newest-first
- **WHEN** the user has multiple submissions for the same enrollment
- **THEN** the My Submissions list renders them in descending order of `submittedAt`

### Requirement: Submission types exposed in frontend types module
The system SHALL extend `frontend/src/api/types.ts` with a `Submission` interface that mirrors the backend DTO: `{ id: string; enrollmentId: string; blobUrl: string | null; externalUrl: string | null; notes: string; submittedAt: string }`. Existing types from previous phases SHALL remain unchanged.

#### Scenario: Submission type compiles against backend DTO
- **WHEN** `yarn type-check` runs on a frontend file that imports `Submission` from `@/api/types` and assigns to it the JSON response from `GET /enrollments/:id/submissions`
- **THEN** TypeScript reports no error
