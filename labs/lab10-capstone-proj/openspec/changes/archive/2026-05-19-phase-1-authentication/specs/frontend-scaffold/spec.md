## MODIFIED Requirements

### Requirement: Application routing
The system SHALL define the following client-side routes using Vue Router: `/` (home/redirect), `/login`, `/auth/callback`, `/challenges`, `/challenges/:id`, `/me`. Navigation between routes SHALL work without a full-page reload.

#### Scenario: Route navigation without reload
- **WHEN** a user clicks a navigation link to `/challenges`
- **THEN** the URL updates and the challenges view renders without a page reload

#### Scenario: Unknown route handling
- **WHEN** a user navigates to an undefined route
- **THEN** they are redirected to `/` or shown a 404 view

#### Scenario: Auth callback route is reachable without authentication
- **WHEN** an unauthenticated user navigates to `/auth/callback?token=<jwt>`
- **THEN** the route renders the `AuthCallbackView` component without being intercepted by the auth guard

### Requirement: Axios API client configuration
The system SHALL provide a pre-configured Axios instance with `baseURL` set from the `VITE_API_URL` environment variable. All API calls in the application SHALL use this shared instance. The instance SHALL include a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage` when present, and a response interceptor that clears the session and redirects to `/login` on HTTP 401.

#### Scenario: API base URL from env
- **WHEN** `VITE_API_URL` is set to `http://localhost:3000`
- **THEN** all Axios requests are sent relative to that base URL

#### Scenario: Authorization header attached when token present
- **WHEN** an Axios request is sent and a JWT exists in `localStorage` under the `auth_token` key
- **THEN** the outgoing request includes header `Authorization: Bearer <token>`

#### Scenario: 401 response clears session
- **WHEN** any Axios response returns HTTP 401
- **THEN** the response interceptor clears the stored token and routes the user to `/login`
