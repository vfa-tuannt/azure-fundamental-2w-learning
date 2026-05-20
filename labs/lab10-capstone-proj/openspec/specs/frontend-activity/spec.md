## ADDED Requirements

### Requirement: Activity types exposed in frontend types module
The system SHALL extend `frontend/src/api/types.ts` with the following types: `ActivityEventType` (a string union of `'challenge_created' | 'enrolled' | 'submitted' | 'approved' | 'rejected'`), a discriminated union `ActivityPayload` whose variant per event type matches the backend's payload contract, an `ActivityEvent` interface `{ id: string; type: ActivityEventType; payload: ActivityPayload; createdAt: string; user: { id: string; name: string; avatarUrl: string | null } }`, and a `MyStats` interface `{ challengesCreated: number; enrollmentsActive: number; enrollmentsApproved: number }`. Existing types from previous phases SHALL remain unchanged.

#### Scenario: ActivityEvent type compiles against backend DTO
- **WHEN** `yarn type-check` runs on a frontend file that imports `ActivityEvent` from `@/api/types` and assigns to it the JSON response from `GET /activity/recent`
- **THEN** TypeScript reports no error

#### Scenario: Discriminated payload narrows on type
- **WHEN** a TypeScript file uses `if (event.type === 'submitted')` to narrow an `ActivityEvent`
- **THEN** inside the branch, `event.payload.kind` is typed as `'file' | 'url'` and the compiler accepts the access

#### Scenario: MyStats type compiles against backend DTO
- **WHEN** `yarn type-check` runs on a frontend file that imports `MyStats` from `@/api/types` and assigns to it the JSON response from `GET /me/stats`
- **THEN** TypeScript reports no error

### Requirement: Typed activity API client
The system SHALL expose a typed API client at `frontend/src/api/activity.ts` with two functions: `listRecent()` returning `Promise<ActivityEvent[]>` and `listMine()` returning `Promise<ActivityEvent[]>`. The client SHALL use the shared axios instance from `frontend/src/api/axios.ts` so the JWT (when present) is attached automatically; `listRecent()` SHALL still succeed when no JWT is present because the backend endpoint is public.

#### Scenario: listRecent works without authentication
- **WHEN** the FE calls `listRecent()` with no JWT in local storage
- **THEN** the client sends a `GET /activity/recent` request without an `Authorization` header and resolves with `ActivityEvent[]`

#### Scenario: listMine sends authenticated GET
- **WHEN** the FE calls `listMine()` while authenticated
- **THEN** the client sends a `GET /activity/me` request with the bearer token attached and resolves with `ActivityEvent[]`

### Requirement: Typed stats API client
The system SHALL expose `getMyStats()` in `frontend/src/api/me.ts` (or extend the existing `enrollments.ts` `getMyEnrollments` neighborhood) returning `Promise<MyStats>` and mapping to `GET /me/stats`. Requests SHALL use the shared axios instance.

#### Scenario: getMyStats issues authenticated GET
- **WHEN** the FE calls `getMyStats()` while authenticated
- **THEN** the client sends a `GET /me/stats` request with the bearer token attached and resolves with `MyStats`

### Requirement: Activity Pinia store
The system SHALL provide a Pinia store at `frontend/src/stores/activity.ts` exposing state `recent: ActivityEvent[]`, `mine: ActivityEvent[]`, `loadingRecent: boolean`, `loadingMine: boolean`, and `error: string | null`, plus actions `loadRecent()`, `loadMine()`, `startGlobalPolling()`, `stopGlobalPolling()`, and `reset()`. The polling actions SHALL use `setInterval(...)` at 30 000 ms and SHALL be idempotent (calling `startGlobalPolling()` twice SHALL NOT create a second timer).

#### Scenario: loadRecent populates state
- **WHEN** a component calls `activityStore.loadRecent()` and the backend returns 10 events
- **THEN** `activityStore.recent` is an array of length 10 and `loadingRecent` returns to `false` once the request resolves

#### Scenario: loadMine populates the mine slice
- **WHEN** a component calls `activityStore.loadMine()` and the backend returns 5 events for the caller
- **THEN** `activityStore.mine` is an array of length 5 and the `recent` slice is unchanged

#### Scenario: startGlobalPolling fetches immediately and every 30 seconds
- **WHEN** a component calls `activityStore.startGlobalPolling()`
- **THEN** `loadRecent()` is invoked once immediately, and again every 30 seconds until `stopGlobalPolling()` is called

#### Scenario: startGlobalPolling is idempotent
- **WHEN** `startGlobalPolling()` is called twice in a row without an intervening `stopGlobalPolling()`
- **THEN** only one interval is active (the second call is a no-op)

#### Scenario: stopGlobalPolling clears the timer
- **WHEN** a component calls `activityStore.stopGlobalPolling()` after polling was started
- **THEN** no further `loadRecent()` calls are made until `startGlobalPolling()` is called again

#### Scenario: reset clears all state
- **WHEN** the user logs out and the auth store calls `activityStore.reset()`
- **THEN** `recent` and `mine` are empty arrays, both `loading*` flags are false, `error` is null, and any active polling interval is cleared

### Requirement: Activity timeline component
The system SHALL provide a presentational component `frontend/src/components/ActivityTimeline.vue` that accepts a single prop `events: ActivityEvent[]` and renders a vertical list of timeline rows. Each row SHALL display: a PrimeVue `Avatar` of the actor (`event.user.avatarUrl` or the initials fallback), a one-line description derived from the event type, a relative timestamp (`formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })`), and — for `challenge_*`, `enrolled`, `submitted`, `approved`, `rejected` event types — a `<router-link>` to `/challenges/<event.payload.challengeId>` on the challenge title. When `events.length === 0`, the component SHALL render a plain-text "No activity yet" placeholder, not an empty list.

#### Scenario: challenge_created row renders correctly
- **WHEN** the component receives an event `{ type: 'challenge_created', user: { name: 'Jane' }, payload: { challengeId: '...', challengeTitle: 'Learn Bicep' }, ... }`
- **THEN** the row contains the text "Jane created Learn Bicep" with "Learn Bicep" as a router-link to `/challenges/<challengeId>`

#### Scenario: enrolled row renders correctly
- **WHEN** the component receives an `enrolled` event
- **THEN** the row contains the text "{actor} enrolled in {challengeTitle}" with the challenge title as a link

#### Scenario: submitted row renders correctly
- **WHEN** the component receives a `submitted` event
- **THEN** the row contains the text "{actor} submitted to {challengeTitle}"

#### Scenario: approved row renders correctly
- **WHEN** the component receives an `approved` event
- **THEN** the row contains the text "{actor}'s submission to {challengeTitle} was approved"

#### Scenario: rejected row renders correctly
- **WHEN** the component receives a `rejected` event
- **THEN** the row contains the text "{actor}'s submission to {challengeTitle} was rejected"

#### Scenario: Empty event list shows placeholder
- **WHEN** the component receives `events: []`
- **THEN** the rendered output contains the plain text "No activity yet" and does NOT render an empty timeline frame

#### Scenario: Avatar uses initials fallback when avatarUrl is null
- **WHEN** the component receives an event whose `user.avatarUrl` is `null`
- **THEN** the PrimeVue `Avatar` displays the actor's initials (first character of the name, uppercased) instead of an `<img>` tag

#### Scenario: Relative timestamp updates between renders
- **WHEN** an event has `createdAt` two minutes in the past and the component re-renders
- **THEN** the visible timestamp text is "2 minutes ago" (or the equivalent locale string)

### Requirement: Stats tiles component
The system SHALL provide a component `frontend/src/components/StatsTiles.vue` that accepts a single prop `stats: MyStats | null` and renders three PrimeVue `Card` (or equivalent) tiles labeled "Challenges Created", "In-Progress Enrollments", and "Approved Enrollments", each showing the matching count from the `stats` prop. When `stats` is `null` (still loading), the tiles SHALL render with a `Skeleton` placeholder instead of a numeric value.

#### Scenario: Tiles render counts from stats
- **WHEN** the component receives `stats: { challengesCreated: 7, enrollmentsActive: 3, enrollmentsApproved: 12 }`
- **THEN** the three tiles display 7, 3, and 12 respectively, each next to its label

#### Scenario: Tiles show skeletons while loading
- **WHEN** the component receives `stats: null`
- **THEN** each tile renders a PrimeVue `Skeleton` (or visually equivalent placeholder) in place of the numeric value

#### Scenario: Zero counts render as "0", not blank
- **WHEN** the component receives `stats: { challengesCreated: 0, enrollmentsActive: 0, enrollmentsApproved: 0 }`
- **THEN** all three tiles display the text "0"

### Requirement: Recent Activity panel on /me
The `/me` view (`frontend/src/views/MeView.vue`) SHALL render a "Recent Activity" panel below the stats tiles and below the existing My Challenges table. The panel SHALL display the user's own activity by binding `<ActivityTimeline :events="activityStore.mine" />` and SHALL trigger `activityStore.loadMine()` on mount.

#### Scenario: MeView loads mine on mount
- **WHEN** an authenticated user navigates to `/me`
- **THEN** within the first render cycle, `activityStore.loadMine()` is invoked, and once the request resolves, the Recent Activity panel shows the events

#### Scenario: Panel shows empty state when user has no activity
- **WHEN** an authenticated user with no recorded events navigates to `/me`
- **THEN** the Recent Activity panel renders the "No activity yet" placeholder

### Requirement: Org-wide Activity panel on home with 30s polling
The home view (`frontend/src/views/ChallengesView.vue`) SHALL render an "Org-wide Activity" panel near the top of the page bound to `<ActivityTimeline :events="activityStore.recent" />`. The view SHALL call `activityStore.startGlobalPolling()` in `onMounted` and `activityStore.stopGlobalPolling()` in `onUnmounted` so polling stops when the route changes. The panel SHALL render whether or not the visitor is authenticated.

#### Scenario: Polling starts on mount
- **WHEN** any visitor (authenticated or not) navigates to the home route
- **THEN** `activityStore.startGlobalPolling()` is invoked, which calls `loadRecent()` immediately and again every 30 seconds while the route is mounted

#### Scenario: Polling stops on route change
- **WHEN** a visitor navigates away from the home route
- **THEN** `activityStore.stopGlobalPolling()` is invoked and no further `loadRecent()` calls are made

#### Scenario: Panel renders for unauthenticated visitor
- **WHEN** an unauthenticated visitor lands on the home route
- **THEN** the Org-wide Activity panel renders and the timeline shows the public feed

#### Scenario: Panel renders for authenticated visitor identically
- **WHEN** an authenticated visitor lands on the home route
- **THEN** the Org-wide Activity panel renders the same DTO content (no special behavior beyond auth header being attached)
