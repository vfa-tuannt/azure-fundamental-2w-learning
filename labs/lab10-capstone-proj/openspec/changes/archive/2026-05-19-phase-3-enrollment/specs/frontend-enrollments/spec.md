## ADDED Requirements

### Requirement: Typed enrollment API client
The system SHALL expose `frontend/src/api/enrollments.ts` providing typed wrappers for `enroll(challengeId)`, `withdraw(challengeId)`, `getMyEnrollments()`, and `getMyEnrollmentForChallenge(challengeId)`. Each wrapper SHALL return data matching the backend DTO shape (camelCase) or throw on HTTP errors. `getMyEnrollmentForChallenge` SHALL resolve to `null` on HTTP 404 instead of throwing, so callers can use the absence of an enrollment as a normal state.

#### Scenario: All enrollment calls go through the typed client
- **WHEN** any view or store fetches or mutates enrollments
- **THEN** it calls one of the exported functions from `src/api/enrollments.ts`, not Axios directly

#### Scenario: getMyEnrollmentForChallenge resolves null on 404
- **WHEN** the backend responds to `GET /challenges/:id/enrollment` with HTTP 404
- **THEN** the client wrapper resolves to `null` instead of throwing

#### Scenario: Other errors propagate
- **WHEN** the backend responds with any non-404 4xx or any 5xx
- **THEN** the wrapper throws so the caller's `try`/`catch` can show a Toast

#### Scenario: Type shape matches backend
- **WHEN** the `Enrollment` and `MyEnrollment` types are consumed by views
- **THEN** `Enrollment` includes `id`, `challengeId`, `userId`, `status`, `enrolledAt`; `MyEnrollment` additionally includes `challenge: { id, title, deadline, status, requiredSkills }`

### Requirement: Enrollments Pinia store
The system SHALL provide a Pinia `enrollmentsStore` that holds a map of the caller's enrollment per challenge (`byChallengeId: Map<string, Enrollment | null>`), the `/me` list (`myList: MyEnrollment[]`), and `loading` / `error` flags. The store SHALL expose actions `loadForChallenge(challengeId)`, `loadMyList()`, `enroll(challengeId)`, `withdraw(challengeId)`, and `reset()`.

#### Scenario: loadForChallenge caches per-challenge result
- **WHEN** `loadForChallenge('abc')` is called and the backend returns an enrollment
- **THEN** `byChallengeId.get('abc')` returns the enrollment

#### Scenario: loadForChallenge caches the not-enrolled state
- **WHEN** `loadForChallenge('abc')` is called and the backend returns 404
- **THEN** `byChallengeId.get('abc')` is `null` (not `undefined`), so the store distinguishes "checked, no enrollment" from "never checked"

#### Scenario: enroll updates store on success
- **WHEN** `enroll('abc')` succeeds
- **THEN** `byChallengeId.get('abc')` is set to the new enrollment with `status = in_progress` and `myList` is invalidated (next read re-fetches)

#### Scenario: withdraw updates store on success
- **WHEN** `withdraw('abc')` succeeds
- **THEN** `byChallengeId.get('abc')` is set to `null` and `myList` is invalidated

#### Scenario: Mutation rollback on failure
- **WHEN** `enroll('abc')` rejects (e.g. backend returns 409)
- **THEN** `byChallengeId.get('abc')` is left at its previous value and `error` is set to a non-empty string

#### Scenario: Reset clears the store
- **WHEN** `reset()` is called (e.g. on logout)
- **THEN** `byChallengeId` is empty, `myList` is `[]`, and `loading`/`error` are reset

### Requirement: Challenge detail page enrollment button
The system SHALL render an enrollment action element on `/challenges/:id` whose label, disabled state, and behavior depend on the viewer's relationship to the challenge. The page SHALL call `enrollmentsStore.loadForChallenge(:id)` on mount when the user is authenticated.

#### Scenario: Owner sees an ownership hint and no button
- **WHEN** the authenticated user is the challenge's `ownerId`
- **THEN** the page shows the text "You own this challenge" and does NOT render an Enroll button

#### Scenario: Unauthenticated visitor sees a sign-in CTA
- **WHEN** the visitor has no JWT
- **THEN** the page renders a "Sign in to enroll" button that routes to `/login`

#### Scenario: Eligible user sees Enroll
- **WHEN** the user is authenticated, not the owner, not enrolled, the challenge `status` is `open`, and (`maxEnrollments` is null OR `enrollmentsCount < maxEnrollments`)
- **THEN** the page renders an enabled "Enroll" button

#### Scenario: Full challenge shows disabled Full button
- **WHEN** the user is authenticated, not the owner, not enrolled, the challenge `status` is `open`, and `enrollmentsCount >= maxEnrollments` with a non-null `maxEnrollments`
- **THEN** the page renders a disabled "Full" button

#### Scenario: Closed challenge shows disabled Closed button
- **WHEN** the user is authenticated, not the owner, not enrolled, and the challenge `status` is `closed`
- **THEN** the page renders a disabled "Closed" button

#### Scenario: Enrolled in_progress shows Withdraw
- **WHEN** the user is authenticated and `byChallengeId.get(:id).status === 'in_progress'`
- **THEN** the page renders an enabled "Withdraw" button that opens a PrimeVue `ConfirmDialog` before calling `withdraw()`

#### Scenario: Submitted/approved/rejected show terminal labels
- **WHEN** the user is enrolled and the enrollment status is `submitted`, `approved`, or `rejected`
- **THEN** the page renders a disabled button labelled "Enrolled (Submitted)", "Enrolled (Approved)", or "Enrolled (Rejected)" respectively

#### Scenario: Enroll click triggers store action and Toast
- **WHEN** the user clicks the "Enroll" button
- **THEN** the page calls `enrollmentsStore.enroll(:id)`; on success a green PrimeVue Toast appears and the button switches to "Withdraw" without a page reload

#### Scenario: Withdraw click confirms then triggers store action
- **WHEN** the user clicks the "Withdraw" button and confirms the `ConfirmDialog`
- **THEN** the page calls `enrollmentsStore.withdraw(:id)`; on success a Toast appears and the button switches to "Enroll" without a page reload

#### Scenario: API error shown as Toast
- **WHEN** the underlying enroll/withdraw API call rejects with any 4xx or 5xx
- **THEN** the page shows a red PrimeVue Toast with a message derived from the response body and the button state is left unchanged

### Requirement: Challenge detail page live enrollment count
The system SHALL render the enrollment count chip on `/challenges/:id` using the challenge's `enrollmentsCount` field. The chip SHALL update locally to `enrollmentsCount + 1` on successful enroll and `enrollmentsCount - 1` on successful withdraw, without requiring a re-fetch of the challenge.

#### Scenario: Count chip initial render
- **WHEN** `/challenges/:id` mounts and `GET /challenges/:id` returns `enrollmentsCount: 3` with `maxEnrollments: 5`
- **THEN** the chip displays "3/5"

#### Scenario: Count chip increments after enroll
- **WHEN** the user successfully enrolls and the previous chip read "3/5"
- **THEN** the chip displays "4/5" without re-fetching the challenge

#### Scenario: Count chip decrements after withdraw
- **WHEN** the user successfully withdraws and the previous chip read "4/5"
- **THEN** the chip displays "3/5" without re-fetching the challenge

#### Scenario: Count chip for unlimited challenges
- **WHEN** the challenge has `maxEnrollments: null` and `enrollmentsCount: 7`
- **THEN** the chip displays "7/—"

### Requirement: My Challenges section on /me
The system SHALL render the `/me` page with two sections: a profile header showing the authenticated user's avatar (or initials fallback), name, and email from the auth store; and a "My Challenges" PrimeVue `DataTable` backed by `enrollmentsStore.myList`. Columns SHALL be Title, Skills (rendered as `Tag` chips), Deadline (locale date), and Status (enrollment status as a colored badge). Clicking a row SHALL navigate to that challenge's detail page.

#### Scenario: Profile header reads from auth store
- **WHEN** an authenticated user visits `/me`
- **THEN** the page renders the user's avatar (or initials), name, and email from `authStore.user`

#### Scenario: My Challenges table renders enrollments
- **WHEN** an authenticated user visits `/me` and has at least one enrollment
- **THEN** the DataTable shows one row per enrollment with Title, Skills (chips), Deadline (locale date), and a Status badge whose color reflects the enrollment status

#### Scenario: Empty state
- **WHEN** an authenticated user visits `/me` and has no enrollments
- **THEN** the page shows an empty-state message such as "You haven't enrolled in any challenges yet" and a link to `/challenges`

#### Scenario: Row click navigates to detail
- **WHEN** a user clicks a row in the My Challenges table
- **THEN** the router navigates to `/challenges/<row.challenge.id>`

#### Scenario: Status badge colors
- **WHEN** an enrollment is rendered in the table
- **THEN** `in_progress` is shown with a neutral/info color, `submitted` with a warning color, `approved` with a success color, and `rejected` with a danger color

#### Scenario: /me requires authentication
- **WHEN** an unauthenticated visitor navigates to `/me`
- **THEN** the global navigation guard redirects them to `/login`
