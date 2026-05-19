## ADDED Requirements

### Requirement: Google OAuth initiation endpoint
The system SHALL expose `GET /auth/google` which, when called by a browser, redirects the user to the Google OAuth consent screen using the `passport-google-oauth20` strategy with the `email` and `profile` scopes.

#### Scenario: Initiate Google sign-in
- **WHEN** an unauthenticated user navigates to `GET /auth/google`
- **THEN** the server responds with HTTP 302 and a `Location` header pointing to `accounts.google.com/o/oauth2/v2/auth` containing the configured `GOOGLE_CLIENT_ID` and scopes

### Requirement: Google OAuth callback endpoint
The system SHALL expose `GET /auth/google/callback` which exchanges the Google authorization code for a profile, applies the Vitalify domain check, upserts a user record, signs an RS256 JWT, and redirects the browser to the frontend callback URL.

#### Scenario: Successful Vitalify sign-in
- **WHEN** Google redirects to `GET /auth/google/callback` with a valid code for a `@vitalify.asia` user
- **THEN** the server upserts the corresponding row in the `users` table (matched by email), signs a JWT (RS256, 7-day expiry, payload `{ sub, email, name, picture }`), and responds with HTTP 302 redirecting to `${FRONTEND_URL}/auth/callback?token=<jwt>`

#### Scenario: Non-Vitalify email rejected
- **WHEN** Google redirects to `GET /auth/google/callback` with a profile whose primary email does not end in `@vitalify.asia`
- **THEN** the server does NOT create or update any `users` row and responds with HTTP 302 redirecting to `${FRONTEND_URL}/login?error=domain`

#### Scenario: Domain check raises ForbiddenException
- **WHEN** the Passport `GoogleStrategy.validate()` callback receives a profile whose email does not end in `@vitalify.asia`
- **THEN** it throws a NestJS `ForbiddenException` before any user upsert occurs

### Requirement: Current user endpoint
The system SHALL expose `GET /auth/me` which returns the authenticated user's `id`, `email`, `name`, and `avatar_url`. The endpoint SHALL be protected by `JwtAuthGuard`.

#### Scenario: Authenticated user fetches their profile
- **WHEN** a client sends `GET /auth/me` with header `Authorization: Bearer <valid-jwt>`
- **THEN** the server responds with HTTP 200 and JSON body `{ id, email, name, avatarUrl }` matching the user identified by the JWT's `sub` claim

#### Scenario: Missing or invalid token rejected
- **WHEN** a client sends `GET /auth/me` without an `Authorization` header or with an invalid/expired JWT
- **THEN** the server responds with HTTP 401 Unauthorized

### Requirement: Logout endpoint
The system SHALL expose `POST /auth/logout` which returns HTTP 200 with an empty body. Because JWTs are stateless, the endpoint SHALL be a no-op server-side; the client is responsible for discarding its token.

#### Scenario: Logout succeeds for authenticated user
- **WHEN** a client sends `POST /auth/logout` with a valid JWT
- **THEN** the server responds with HTTP 200 and the body `{ "success": true }`

#### Scenario: Logout works without authentication
- **WHEN** a client sends `POST /auth/logout` without a token
- **THEN** the server still responds with HTTP 200 (idempotent)

### Requirement: Reusable JWT authentication guard
The system SHALL provide a `JwtAuthGuard` (NestJS guard) that validates `Authorization: Bearer <jwt>` headers using the RS256 public key. The guard SHALL be applicable to any controller or method via `@UseGuards(JwtAuthGuard)`.

#### Scenario: Valid JWT grants access
- **WHEN** a request with header `Authorization: Bearer <valid-jwt>` hits a route protected by `JwtAuthGuard`
- **THEN** the guard allows the request to proceed and attaches the decoded payload to `request.user`

#### Scenario: Invalid signature rejected
- **WHEN** a request with header `Authorization: Bearer <jwt-signed-with-wrong-key>` hits a guarded route
- **THEN** the guard responds with HTTP 401

#### Scenario: Expired token rejected
- **WHEN** a request with header `Authorization: Bearer <expired-jwt>` hits a guarded route
- **THEN** the guard responds with HTTP 401

### Requirement: Users table persistence
The system SHALL persist Vitalify users in a `users` table with columns `id` (uuid, primary key), `email` (varchar, unique, not null), `name` (varchar, not null), `avatar_url` (varchar, nullable), and `created_at` (timestamptz, default `now()`). The table SHALL be created via a TypeORM migration.

#### Scenario: Migration creates users table
- **WHEN** `npm run migration:run` is executed against an empty database
- **THEN** the `users` table is created with all required columns and the `email` column has a unique constraint

#### Scenario: Duplicate email is prevented at the database level
- **WHEN** the application attempts to insert a second `users` row with an existing email
- **THEN** the insert fails with a unique-constraint violation (the upsert logic in callback handles this case before raising the error)

### Requirement: JWT signing key configuration
The system SHALL load the RS256 private and public keys from environment variables `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`. The application SHALL fail to start if either variable is missing.

#### Scenario: Missing JWT keys at boot
- **WHEN** the application starts without `JWT_PRIVATE_KEY` or `JWT_PUBLIC_KEY` set
- **THEN** the application exits with a configuration error and does NOT serve requests

#### Scenario: Valid keys at boot
- **WHEN** the application starts with both keys set to valid PEM-formatted strings
- **THEN** the application boots successfully and can sign and verify JWTs

### Requirement: Environment variables for OAuth
The system SHALL load Google OAuth client configuration from environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, and `FRONTEND_URL`. The `.env.example` file SHALL document each.

#### Scenario: .env.example documents OAuth variables
- **WHEN** a developer clones the repository and inspects `.env.example`
- **THEN** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`, `JWT_PRIVATE_KEY`, and `JWT_PUBLIC_KEY` are all listed with placeholder example values
