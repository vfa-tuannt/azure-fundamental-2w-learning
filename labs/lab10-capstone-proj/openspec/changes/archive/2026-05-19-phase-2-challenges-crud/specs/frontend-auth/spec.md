## MODIFIED Requirements

### Requirement: Route guard for protected routes
The system SHALL register a Vue Router `beforeEach` global navigation guard that redirects unauthenticated users to `/login`. Routes that should be reachable without authentication SHALL declare `meta.public: true` in the router definition; the guard SHALL allow any route with `meta.public === true` and require authentication for everything else. The routes that SHALL be marked public are `/login`, `/auth/callback`, `/challenges`, and `/challenges/:id`. All other routes (including `/challenges/new`, `/challenges/:id/edit`, and `/me`) require authentication.

#### Scenario: Public challenges list reachable without auth
- **WHEN** a user with no token navigates to `/challenges`
- **THEN** the router allows the navigation and the challenges list view renders without redirect

#### Scenario: Public challenge detail reachable without auth
- **WHEN** a user with no token navigates to `/challenges/<id>`
- **THEN** the router allows the navigation and the detail view renders without redirect

#### Scenario: Challenge form routes require authentication
- **WHEN** a user with no token navigates to `/challenges/new` or `/challenges/<id>/edit`
- **THEN** the router redirects to `/login`

#### Scenario: Unauthenticated user blocked from /me
- **WHEN** a user with no token navigates to `/me`
- **THEN** the router redirects to `/login`

#### Scenario: Authenticated user accesses protected route
- **WHEN** a user with a valid token navigates to `/me`
- **THEN** the router allows the navigation and the profile view renders

#### Scenario: Login route is publicly reachable
- **WHEN** a user with no token navigates to `/login`
- **THEN** the login view renders without redirect
