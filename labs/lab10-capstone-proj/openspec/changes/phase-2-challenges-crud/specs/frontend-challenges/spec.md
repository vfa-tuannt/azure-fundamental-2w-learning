## ADDED Requirements

### Requirement: Challenge list page
The system SHALL render `/challenges` using a PrimeVue `DataTable` with columns Title, Skills (rendered as `Tag` chips), Deadline (formatted date), Enrolled/Max (renders as `<enrollmentsCount>/<maxEnrollments or "—">`), and Status (rendered as a colored badge). The page SHALL include a filter bar with a skill text input and a status dropdown (options: All, Open, Closed), pagination controls beneath the table, and a "Create Challenge" button visible to all authenticated users.

#### Scenario: List renders rows for non-deleted challenges
- **WHEN** an authenticated user visits `/challenges` and the API returns at least one item
- **THEN** the DataTable shows one row per item with Title, Skills (chips), Deadline (locale date), Enrolled/Max, and Status badge

#### Scenario: Filter by skill triggers refetch
- **WHEN** a user types a value in the skill input and submits (blur, Enter, or filter button)
- **THEN** the table refetches `GET /challenges?skill=<value>&page=1&limit=<current-limit>` and replaces the rows; pagination resets to page 1

#### Scenario: Filter by status triggers refetch
- **WHEN** a user selects `Open` or `Closed` in the status dropdown
- **THEN** the table refetches `GET /challenges?status=<value>` (with any active skill filter) and replaces the rows

#### Scenario: Pagination
- **WHEN** the user changes the page via the Paginator
- **THEN** the table refetches `GET /challenges?page=<new>&limit=<current>` and replaces the rows; total count drives the page count display

#### Scenario: Row click navigates to detail
- **WHEN** a user clicks a row
- **THEN** the router navigates to `/challenges/:id` for that row's id

#### Scenario: "Create Challenge" visible only to authenticated users
- **WHEN** the auth store reports `isAuthenticated === true`
- **THEN** a "Create Challenge" button is rendered above the table and routes to `/challenges/new` on click

### Requirement: Challenge detail page
The system SHALL render `/challenges/:id` showing the title, the markdown-rendered description (`md-editor-v3` in `preview-only` mode), skill chips, deadline, owner name, and enrollment count (`enrollmentsCount` / `maxEnrollments` or `—`). The page SHALL fetch via `GET /challenges/:id` on mount. When the authenticated user is the owner, the page SHALL also show "Edit" and "Delete" buttons.

#### Scenario: Markdown description rendered
- **WHEN** the challenge's description contains markdown (e.g., headers, lists, code blocks)
- **THEN** the description area shows the rendered HTML, not the raw source

#### Scenario: Owner-only actions visible
- **WHEN** `authStore.user.id === challenge.ownerId`
- **THEN** "Edit" and "Delete" buttons are visible

#### Scenario: Non-owner actions hidden
- **WHEN** the user is unauthenticated, or `authStore.user.id !== challenge.ownerId`
- **THEN** the "Edit" and "Delete" buttons are not rendered

#### Scenario: Edit button navigates to form
- **WHEN** the owner clicks "Edit"
- **THEN** the router navigates to `/challenges/:id/edit`

#### Scenario: Delete button confirms then deletes
- **WHEN** the owner clicks "Delete" and confirms a PrimeVue `ConfirmDialog`
- **THEN** the FE calls `DELETE /challenges/:id`, then on success navigates to `/challenges` and shows a success Toast

#### Scenario: 404 detail shows not-found state
- **WHEN** `GET /challenges/:id` responds with HTTP 404
- **THEN** the page shows a "Challenge not found" message and a link back to `/challenges`

### Requirement: Challenge create/edit form
The system SHALL render a single `ChallengeFormView` mounted at both `/challenges/new` and `/challenges/:id/edit`. The form SHALL include: Title (PrimeVue `InputText`, required), Description (`md-editor-v3` in editor mode, required), Skills (PrimeVue `Chips`, may be empty), Deadline (PrimeVue `DatePicker`, required, must be in the future), and Max Enrollments (PrimeVue `InputNumber`, optional). On submit, the form SHALL call `POST /challenges` on the create route, or `PATCH /challenges/:id` on the edit route, then navigate to `/challenges/:id` on success.

#### Scenario: Edit route prefills form
- **WHEN** a user navigates to `/challenges/:id/edit` and the API returns the challenge
- **THEN** all form fields are pre-populated with the challenge's current values

#### Scenario: Client-side validation: title required
- **WHEN** the user submits the form with an empty `title`
- **THEN** the form shows an inline error under the Title field and the API is NOT called

#### Scenario: Client-side validation: deadline must be in the future
- **WHEN** the user submits the form with a `deadline` earlier than or equal to "now"
- **THEN** the form shows an inline error under the Deadline field and the API is NOT called

#### Scenario: Create success
- **WHEN** the user submits a valid form on `/challenges/new` and `POST /challenges` responds with HTTP 201
- **THEN** the router navigates to `/challenges/<new-id>` and a success Toast is shown

#### Scenario: Edit success
- **WHEN** the owner submits a valid form on `/challenges/:id/edit` and `PATCH /challenges/:id` responds with HTTP 200
- **THEN** the router navigates back to `/challenges/:id` and a success Toast is shown

#### Scenario: API error shows toast
- **WHEN** the API responds with HTTP 4xx or 5xx
- **THEN** an error Toast is shown with a message derived from the response body, and the form remains editable with its values intact

#### Scenario: Unauthenticated access redirected
- **WHEN** an unauthenticated visitor navigates to `/challenges/new` or `/challenges/:id/edit`
- **THEN** the router guard redirects them to `/login`

### Requirement: Typed challenge API client
The system SHALL expose `frontend/src/api/challenges.ts` providing typed wrappers for `listChallenges(params)`, `getChallenge(id)`, `createChallenge(dto)`, `updateChallenge(id, dto)`, and `deleteChallenge(id)`, each returning a `Challenge` or `ChallengeListResponse` matching the backend DTO shape (camelCase, including `enrollmentsCount`).

#### Scenario: All challenge calls go through the typed client
- **WHEN** any challenge view fetches or mutates challenges
- **THEN** it calls one of the exported functions, not Axios directly

#### Scenario: Type shape matches backend
- **WHEN** the `Challenge` type is consumed by views
- **THEN** it includes `id`, `ownerId`, `title`, `description`, `requiredSkills`, `deadline`, `maxEnrollments`, `status`, `createdAt`, and `enrollmentsCount`

### Requirement: Challenges Pinia store
The system SHALL provide a Pinia `challengesStore` that holds list state (`items`, `page`, `limit`, `total`, `filters: { skill, status }`, `loading`, `error`) and exposes actions `fetchList(params?)`, `setFilters(filters)`, `setPage(page)`, and `reset()`. The store SHALL reset filters and pagination when `reset()` is called.

#### Scenario: Filter change resets to page 1
- **WHEN** `setFilters({ skill: 'azure' })` is called
- **THEN** the store sets `filters.skill = 'azure'`, sets `page = 1`, and dispatches `fetchList()`

#### Scenario: Loading flag toggles
- **WHEN** `fetchList()` is invoked
- **THEN** `loading` is `true` while the request is in flight and `false` after it resolves or rejects

#### Scenario: Error captured on failure
- **WHEN** the underlying API call rejects
- **THEN** `error` is set to a non-empty string and `items` is left as the previous successful result

### Requirement: Markdown editor styling loaded once
The system SHALL import `md-editor-v3` CSS exactly once at application bootstrap (in `frontend/src/main.ts`) so that both the editor and viewer instances render with their default styles.

#### Scenario: CSS available everywhere
- **WHEN** any view mounts an `md-editor-v3` component (editor or preview-only)
- **THEN** the component renders with its default styling, with no missing-CSS warnings in the console
