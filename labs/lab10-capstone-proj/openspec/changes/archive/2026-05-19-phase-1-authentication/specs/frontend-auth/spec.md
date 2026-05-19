## ADDED Requirements

### Requirement: Pinia auth store
The system SHALL provide a Pinia store `authStore` exposing reactive state `user` (object or null), `token` (string or null), and `isAuthenticated` (boolean derived from `token !== null`), plus actions `login()`, `logout()`, and `fetchMe()`.

#### Scenario: Login redirects to backend OAuth initiator
- **WHEN** a component calls `authStore.login()`
- **THEN** the browser is navigated to `${VITE_API_URL}/auth/google` via a full-page redirect

#### Scenario: Logout clears state and storage
- **WHEN** a component calls `authStore.logout()`
- **THEN** `user` and `token` are set to `null`, the `auth_token` key is removed from `localStorage`, and the user is routed to `/login`

#### Scenario: Hydrate user from existing token
- **WHEN** the application boots and a valid `auth_token` exists in `localStorage`
- **THEN** the store sets `token`, calls `fetchMe()`, and populates `user` with the response of `GET /auth/me`

#### Scenario: Hydrate fails on invalid token
- **WHEN** the application boots with a token in `localStorage` but `GET /auth/me` returns 401
- **THEN** the store calls `logout()` so the user lands on `/login`

### Requirement: Persistent token storage
The system SHALL persist the JWT in `localStorage` under the key `auth_token`. Any change to the store's `token` SHALL synchronously update `localStorage`.

#### Scenario: Token written on receipt
- **WHEN** the auth-callback flow sets `authStore.token` to a new JWT
- **THEN** `localStorage.getItem('auth_token')` returns that JWT immediately after

#### Scenario: Token cleared on logout
- **WHEN** `authStore.logout()` runs
- **THEN** `localStorage.getItem('auth_token')` returns `null`

### Requirement: Axios authorization interceptor
The system SHALL configure two Axios interceptors on the shared client (`src/api/axios.ts`):
- A request interceptor that attaches `Authorization: Bearer <token>` to every request when a token is present in `localStorage`
- A response interceptor that, on HTTP 401, calls `authStore.logout()` to clear local credentials and redirect to `/login`

#### Scenario: Authorization header attached automatically
- **WHEN** a token exists in `localStorage` and the application makes any Axios request
- **THEN** the outgoing request contains the header `Authorization: Bearer <token>`

#### Scenario: Anonymous request has no Authorization header
- **WHEN** no token exists in `localStorage` and the application makes an Axios request
- **THEN** the outgoing request has no `Authorization` header

#### Scenario: 401 response triggers logout
- **WHEN** any Axios response returns HTTP 401
- **THEN** the response interceptor invokes `authStore.logout()` and the user is redirected to `/login`

### Requirement: Route guard for protected routes
The system SHALL register a Vue Router `beforeEach` global navigation guard that redirects unauthenticated users to `/login`. The guard SHALL exempt only `/login` and `/auth/callback`.

#### Scenario: Unauthenticated user blocked from /challenges
- **WHEN** a user with no token navigates to `/challenges`
- **THEN** the router redirects to `/login` and the challenges view does not render

#### Scenario: Authenticated user accesses protected route
- **WHEN** a user with a valid token navigates to `/me`
- **THEN** the router allows the navigation and the profile view renders

#### Scenario: Login route is publicly reachable
- **WHEN** a user with no token navigates to `/login`
- **THEN** the login view renders without redirect

### Requirement: OAuth callback handler view
The system SHALL provide a route `/auth/callback` mapped to an `AuthCallbackView` component that reads the `token` query parameter, stores it via `authStore`, removes the token from the URL using `router.replace`, fetches the current user, and redirects to `/challenges`.

#### Scenario: Successful callback stores token and lands on challenges
- **WHEN** the browser navigates to `/auth/callback?token=<jwt>`
- **THEN** the JWT is persisted via `authStore`, the URL bar updates to `/auth/callback` (without the token query), and within one navigation tick the user lands on `/challenges`

#### Scenario: Callback without token redirects to login
- **WHEN** the browser navigates to `/auth/callback` with no `token` query parameter
- **THEN** the user is redirected to `/login?error=missing_token`

### Requirement: Login page with Google sign-in
The system SHALL render the `/login` page with a centered card containing the app logo and a PrimeVue button labelled "Sign in with Google". The button SHALL invoke `authStore.login()` on click.

#### Scenario: Sign-in button triggers OAuth flow
- **WHEN** a user clicks "Sign in with Google" on `/login`
- **THEN** the browser navigates to `${VITE_API_URL}/auth/google`

#### Scenario: Domain-error message shown
- **WHEN** the user lands on `/login?error=domain`
- **THEN** the login page displays a clear message indicating that only `@vitalify.asia` accounts are allowed

### Requirement: Navbar reflects authentication state
The system SHALL display the authenticated user's avatar (`avatar_url` if available, otherwise initials) and name in the navbar. The navbar SHALL provide a logout action that calls `authStore.logout()`.

#### Scenario: Authenticated user sees avatar and name
- **WHEN** a user is authenticated and any non-`/login` route is rendered
- **THEN** the navbar shows the user's avatar (or initials fallback) and their display name

#### Scenario: Logout action clears session
- **WHEN** an authenticated user clicks the logout action in the navbar
- **THEN** `authStore.logout()` runs, the token is cleared from `localStorage`, and the user is redirected to `/login`
