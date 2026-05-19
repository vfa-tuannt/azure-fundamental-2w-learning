## MODIFIED Requirements

### Requirement: Submission types exposed in frontend types module
The system SHALL extend `frontend/src/api/types.ts` with a `Submission` interface that mirrors the backend DTO: `{ id: string; enrollmentId: string; blobUrl: string | null; externalUrl: string | null; notes: string; submittedAt: string; rejectionReason: string | null; reviewedAt: string | null }`. Existing types from previous phases SHALL remain unchanged.

#### Scenario: Submission type compiles against backend DTO
- **WHEN** `yarn type-check` runs on a frontend file that imports `Submission` from `@/api/types` and assigns to it the JSON response from `GET /enrollments/:id/submissions`
- **THEN** TypeScript reports no error

#### Scenario: Submission type includes review fields
- **WHEN** a frontend file accesses `submission.rejectionReason` or `submission.reviewedAt` on a value typed as `Submission`
- **THEN** TypeScript reports no error and the inferred type is `string | null`

### Requirement: My Submissions list on challenge detail
The challenge detail view SHALL render a "My Submissions" list **only** when the authenticated caller has an enrollment for the displayed challenge AND has at least one submission for that enrollment. Each list entry SHALL display the submission filename (parsed from `blobUrl` after the last `/` and uri-decoded, or the `externalUrl` host if it is an external URL submission), the relative submitted-at timestamp, the notes (when non-empty), and — when the submission has been rejected — a rejection banner showing the `rejectionReason` text (or a default "No reason provided" message when `rejectionReason` is null but `reviewedAt` is non-null and the parent enrollment status is `rejected`). File entries SHALL render the filename as a link that opens `blobUrl` in a new tab; URL entries SHALL render the URL as a link to `externalUrl`.

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

#### Scenario: Rejection banner shown for rejected submission with reason
- **WHEN** a submission has `rejectionReason: "Output does not match the required structure"` and a non-null `reviewedAt`, and the user's enrollment status is `rejected`
- **THEN** the My Submissions list entry renders a rejection banner (e.g. a PrimeVue `Message` with `severity="error"` or a Tailwind-styled red callout) containing the text "Output does not match the required structure"

#### Scenario: Rejection banner shown without reason
- **WHEN** a submission has `rejectionReason: null` and a non-null `reviewedAt`, and the user's enrollment status is `rejected`
- **THEN** the My Submissions list entry renders a rejection banner with a default message such as "Submission rejected — no reason provided"

#### Scenario: No rejection banner for approved submission
- **WHEN** a submission has a non-null `reviewedAt` and the user's enrollment status is `approved`
- **THEN** the My Submissions list entry does NOT render a rejection banner

#### Scenario: No rejection banner for unreviewed submission
- **WHEN** a submission has `reviewedAt: null` (parent enrollment is still `submitted`)
- **THEN** the My Submissions list entry does NOT render a rejection banner
