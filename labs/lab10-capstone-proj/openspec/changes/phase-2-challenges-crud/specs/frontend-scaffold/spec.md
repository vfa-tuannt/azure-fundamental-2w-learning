## MODIFIED Requirements

### Requirement: Application routing
The system SHALL define the following client-side routes using Vue Router: `/` (home/redirect), `/login`, `/auth/callback`, `/challenges`, `/challenges/new`, `/challenges/:id`, `/challenges/:id/edit`, `/me`. Navigation between routes SHALL work without a full-page reload. The `/challenges/new` and `/challenges/:id/edit` routes SHALL require authentication via the existing global navigation guard; unauthenticated visitors SHALL be redirected to `/login`.

#### Scenario: Route navigation without reload
- **WHEN** a user clicks a navigation link to `/challenges`
- **THEN** the URL updates and the challenges view renders without a page reload

#### Scenario: Unknown route handling
- **WHEN** a user navigates to an undefined route
- **THEN** they are redirected to `/` or shown a 404 view

#### Scenario: Auth callback route is reachable without authentication
- **WHEN** an unauthenticated user navigates to `/auth/callback?token=<jwt>`
- **THEN** the route renders the `AuthCallbackView` component without being intercepted by the auth guard

#### Scenario: Challenge form routes require authentication
- **WHEN** an unauthenticated user navigates to `/challenges/new` or `/challenges/:id/edit`
- **THEN** the global navigation guard redirects them to `/login`

#### Scenario: Challenge form routes accessible when authenticated
- **WHEN** an authenticated user navigates to `/challenges/new` or `/challenges/:id/edit`
- **THEN** the corresponding `ChallengeFormView` component renders inside the application shell
