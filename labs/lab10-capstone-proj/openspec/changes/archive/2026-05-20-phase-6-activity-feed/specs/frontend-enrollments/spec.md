## MODIFIED Requirements

### Requirement: My Challenges section on /me
The system SHALL render the `/me` page with four sections, in this top-to-bottom order: (1) a **profile header** showing the authenticated user's avatar (or initials fallback), name, and email from the auth store; (2) a **stats tiles** row rendering the `<StatsTiles>` component bound to a local `stats` ref populated by a single `GET /me/stats` request on mount (the tiles SHALL show Skeleton placeholders until the request resolves); (3) a **"My Challenges"** PrimeVue `DataTable` backed by `enrollmentsStore.myList` with columns Title, Skills (rendered as `Tag` chips), Deadline (locale date), and Status (enrollment status as a colored badge); and (4) a **"Recent Activity"** panel rendering `<ActivityTimeline :events="activityStore.mine" />` after the view calls `activityStore.loadMine()` on mount. Clicking a row in the My Challenges table SHALL navigate to that challenge's detail page.

#### Scenario: Profile header reads from auth store
- **WHEN** an authenticated user visits `/me`
- **THEN** the page renders the user's avatar (or initials), name, and email from `authStore.user`

#### Scenario: Stats tiles fetched on mount
- **WHEN** an authenticated user navigates to `/me`
- **THEN** within the first render cycle the view issues a single `GET /me/stats` request, and once it resolves the three tiles render the returned `challengesCreated`, `enrollmentsActive`, and `enrollmentsApproved` counts

#### Scenario: Stats tiles show skeletons while loading
- **WHEN** the user lands on `/me` and the `GET /me/stats` request has not yet resolved
- **THEN** each of the three tiles displays a PrimeVue `Skeleton` placeholder instead of a number

#### Scenario: My Challenges table renders enrollments
- **WHEN** an authenticated user visits `/me` and has at least one enrollment
- **THEN** the DataTable shows one row per enrollment with Title, Skills (chips), Deadline (locale date), and a Status badge whose color reflects the enrollment status

#### Scenario: Empty state for My Challenges
- **WHEN** an authenticated user visits `/me` and has no enrollments
- **THEN** the page shows an empty-state message such as "You haven't enrolled in any challenges yet" and a link to `/challenges` in place of the DataTable; the stats tiles and Recent Activity panel still render

#### Scenario: Row click navigates to detail
- **WHEN** a user clicks a row in the My Challenges table
- **THEN** the router navigates to `/challenges/<row.challenge.id>`

#### Scenario: Status badge colors
- **WHEN** an enrollment is rendered in the table
- **THEN** `in_progress` is shown with a neutral/info color, `submitted` with a warning color, `approved` with a success color, and `rejected` with a danger color

#### Scenario: Recent Activity panel loads on mount
- **WHEN** an authenticated user navigates to `/me`
- **THEN** within the first render cycle `activityStore.loadMine()` is invoked, and once the request resolves the Recent Activity panel renders the user's events newest-first; if the user has zero events, the panel renders the "No activity yet" placeholder

#### Scenario: /me requires authentication
- **WHEN** an unauthenticated visitor navigates to `/me`
- **THEN** the global navigation guard redirects them to `/login`
