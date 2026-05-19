## ADDED Requirements

### Requirement: Health endpoint
The system SHALL expose a `GET /health` endpoint that returns HTTP 200 with body `{ "status": "ok" }` without requiring authentication, verifiable by any HTTP client.

#### Scenario: Health check returns ok
- **WHEN** a client sends `GET /health`
- **THEN** the server responds with HTTP 200 and JSON body `{ "status": "ok" }`

### Requirement: TypeORM Postgres connection
The system SHALL connect to a PostgreSQL 16 database using a connection string provided via the `DATABASE_URL` environment variable, and SHALL fail to start if the variable is missing or the connection cannot be established.

#### Scenario: Successful database connection
- **WHEN** `DATABASE_URL` is set to a valid Postgres connection string and the database is reachable
- **THEN** the NestJS application starts without errors

#### Scenario: Missing DATABASE_URL
- **WHEN** `DATABASE_URL` is not set
- **THEN** the application fails to start with a descriptive configuration error

### Requirement: CORS configuration
The system SHALL allow cross-origin requests from the frontend origin, defaulting to `http://localhost:5173` in local development. The allowed origin SHALL be overridable via the `CORS_ORIGIN` environment variable.

#### Scenario: Default CORS in development
- **WHEN** `CORS_ORIGIN` env var is not set
- **THEN** the server allows requests from `http://localhost:5173`

#### Scenario: Production CORS override
- **WHEN** `CORS_ORIGIN` is set to a specific URL (e.g., `https://app.azurestaticapps.net`)
- **THEN** the server allows requests only from that URL

### Requirement: Environment variable template
The system SHALL include a `.env.example` file committed to version control listing all required environment variables with placeholder values. The actual `.env` file SHALL be listed in `.gitignore`.

#### Scenario: .env.example present
- **WHEN** a developer clones the repository
- **THEN** `.env.example` exists and lists `DATABASE_URL` and `CORS_ORIGIN` with example values

### Requirement: Linting and tests pass on CI
The system SHALL have a GitHub Actions CI workflow that runs `yarn lint` and `yarn test` for the backend on every push and pull request to `main`, and the workflow SHALL succeed on a clean checkout.

#### Scenario: CI lint job passes
- **WHEN** code is pushed to `main`
- **THEN** the `lint` step completes with exit code 0

#### Scenario: CI test job passes
- **WHEN** code is pushed to `main`
- **THEN** the `test` step completes with exit code 0

#### Scenario: Typecheck passes
- **WHEN** `tsc --noEmit` (or equivalent) is run against the backend source
- **THEN** no TypeScript errors are reported
