# PRD: Skill Challenge Platform (Vitalify Internal)

## 1. Introduction / Overview

An internal web platform that allows Vitalify members to **post skill challenges** that the organization needs to grow (e.g., "Learn ARM templates + Azure Functions for upcoming Azure projects"), and **other members to enroll and complete them by uploading outputs**. The goal is to systematically close skill gaps so the organization can take on more diverse projects.

**Restrictions:** Only `@vitalify.asia` Google Workspace accounts can sign in.

**Architecture philosophy:**
- All feature development done **locally first** (Phases 0–6).
- Azure infrastructure provisioned and deployed only in **Phase 7** (after BE + FE are feature-complete).
- Each phase is deliberately small — BE + FE shipped together, validated with real user flows.
- API contracts defined via **[OpenSpec](https://openspec.dev) change proposals** before coding each phase.

**Tech stack:**
- **Runtime:** Node 24.13.0 (pinned in `.nvmrc`), package manager **yarn 1.22.22** (npm is not used)
- **Backend:** NestJS 11, TypeORM, PostgreSQL 16
- **Frontend:** Vue 3 (Vite), TypeScript, PrimeVue, Pinia
- **Local infra:** Docker Compose (Postgres 16 + pgAdmin + Azurite)
- **IaC:** Terraform (HCL)
- **Auth:** `passport-google-oauth20`, JWT (RS256)
- **Markdown:** `md-editor-v3` (Vue 3 native)
- **Serverless:** Azure Functions v2 (Python 3.11, Consumption plan)

---

## 2. Goals

- Enable organization members to post, enroll in, and complete skill challenges.
- Integrate every Azure service from the 2-week learning plan with clear purpose.
- Ship a portfolio-quality product: working E2E, CI/CD, observability, IaC, OpenSpec API docs.
- Keep monthly Azure cost under $40 (student subscription, $100 credit).

---

## 3. Development Workflow (OpenSpec)

Each Phase 1–6 follows this workflow:

```
1. Write OpenSpec change proposal
   → defines new/changed API endpoints (request, response, errors)
   → generates TypeScript types for BE and FE

2. Implement BE
   → NestJS controllers/services matching the spec
   → TypeORM migrations
   → Unit + E2E tests

3. Implement FE
   → Vue components consuming the generated API types
   → PrimeVue UI, Pinia store, routing
   → Browser verification

4. Review phase — demo the feature end-to-end locally before moving on
```

---

## 4. User Stories

---

### Phase 0 — Project Setup (no Azure, no OpenSpec yet)

**Goal:** Both BE and FE scaffolded, running locally, CI passing.

---

#### US-001: NestJS scaffold + local Postgres via Docker Compose
**Description:** As a developer, I need a NestJS project connected to local Postgres so the backend has a working foundation.

**Acceptance Criteria:**
- [ ] NestJS project init with TypeScript, ESLint (flat config), Prettier
- [ ] TypeORM configured for Postgres; `DATABASE_URL` from `.env`
- [ ] `docker-compose.yml` runs: `postgres:16`, `pgadmin4`, `azurite` (blob emulator)
- [ ] `GET /health` returns `{ status: "ok" }` with HTTP 200
- [ ] CORS configured: allow `http://localhost:5173` in dev; production origin injected via `CORS_ORIGIN` env var
- [ ] `yarn test` and `yarn lint` pass on CI (GitHub Actions)
- [ ] `.env.example` committed; `.env` in `.gitignore`
- [ ] Typecheck passes

#### US-002: Vue 3 + PrimeVue scaffold + base layout
**Description:** As a developer, I need a Vue 3 frontend with routing and base layout so the FE has a working foundation.

**Acceptance Criteria:**
- [ ] Vue 3 (Vite) + TypeScript + PrimeVue (Lara theme) + Pinia + Vue Router installed
- [ ] Base layout: top navbar (logo, profile avatar placeholder) + left sidebar + main content area
- [ ] Routes defined: `/`, `/login`, `/challenges`, `/challenges/:id`, `/me`
- [ ] Axios instance configured with base URL from `VITE_API_URL` env var
- [ ] `yarn build` succeeds with no TS errors
- [ ] Typecheck and lint pass
- [ ] Verify in browser: layout renders, routes navigate without errors

---

### Phase 1 — Authentication

**OpenSpec change proposal:** Define `POST /auth/google`, `GET /auth/me`, `POST /auth/logout`.

---

#### US-003: BE — Google OAuth + JWT + domain restriction
**Description:** As a user, I want to sign in with my Google account so I can access the platform — and only `@vitalify.asia` accounts are accepted.

**Acceptance Criteria:**
- [ ] `passport-google-oauth20` strategy configured
- [ ] `GET /auth/google` redirects to Google consent screen
- [ ] `GET /auth/google/callback` exchanges code; rejects non-`@vitalify.asia` emails with HTTP 403
- [ ] On success: upsert `users` table record, return signed JWT (RS256, 7-day expiry)
- [ ] JWT payload: `{ sub: userId, email, name, picture }`
- [ ] `GET /auth/me` — returns current user or 401 if no valid JWT
- [ ] `JwtAuthGuard` implemented and reusable across controllers
- [ ] Typecheck passes

#### US-004: FE — Login page + auth store + protected routes
**Description:** As a user, I want a login page that redirects me to Google Sign-In so I can access the platform.

**Acceptance Criteria:**
- [ ] `/login` page: centered card with app logo, "Sign in with Google" PrimeVue button
- [ ] Clicking button redirects to `GET /auth/google`
- [ ] On successful OAuth callback, FE stores JWT in `localStorage`
- [ ] Pinia `authStore` exposes `user`, `isAuthenticated`, `login()`, `logout()`
- [ ] All routes except `/login` are guarded; unauthenticated users redirect to `/login`
- [ ] Navbar shows user avatar + name when authenticated; logout clears token
- [ ] Typecheck passes
- [ ] Verify in browser: full login/logout cycle works

---

### Phase 2 — Challenges CRUD

**OpenSpec change proposal:** Define `GET /challenges`, `GET /challenges/:id`, `POST /challenges`, `PATCH /challenges/:id`, `DELETE /challenges/:id`.

---

#### US-005: BE — Challenge CRUD
**Description:** As a developer, I need Challenge CRUD endpoints so members can post and browse skill challenges.

**Acceptance Criteria:**
- [ ] `challenges` table: `id`, `owner_id (FK users)`, `title`, `description (text)`, `required_skills (text[])`, `deadline (timestamptz)`, `max_enrollments (int, nullable)`, `status (enum: open|closed)`, `created_at`, `deleted_at (soft-delete)`
- [ ] `POST /challenges` — authenticated; creates challenge owned by current user
- [ ] `GET /challenges` — public list; paginated (`?page=&limit=`); filterable by `?status=&skill=`
- [ ] `GET /challenges/:id` — public detail; includes `enrollments_count`
- [ ] `PATCH /challenges/:id` — owner only; partial update
- [ ] `DELETE /challenges/:id` — owner only; soft-delete (`deleted_at`)
- [ ] TypeORM migration generated and applied
- [ ] Typecheck passes

#### US-006: FE — Challenge list page
**Description:** As a user, I want to browse all challenges so I can find skills to learn.

**Acceptance Criteria:**
- [ ] `/challenges` page: PrimeVue DataTable with columns: Title, Skills (chips), Deadline, Enrolled/Max, Status badge
- [ ] Filter bar: skill text input + status dropdown (All / Open / Closed)
- [ ] Pagination controls
- [ ] Click row navigates to `/challenges/:id`
- [ ] "Create Challenge" button visible for all authenticated users
- [ ] Typecheck passes
- [ ] Verify in browser: list renders, filters work, pagination works

#### US-007: FE — Challenge detail + create/edit form (with markdown editor)
**Description:** As a user, I want to view challenge details and as an authenticated user create or edit challenges with rich markdown content.

**Acceptance Criteria:**
- [ ] `/challenges/:id` page: title, markdown-rendered description (`md-editor-v3` viewer mode), skill chips, deadline, enroll count
- [ ] Owner sees "Edit" and "Delete" buttons; non-owners do not
- [ ] Create/Edit page: PrimeVue form with Title (InputText), Description (`md-editor-v3` in edit mode), Skills (Chips), Deadline (DatePicker), Max Enrollments (InputNumber, optional)
- [ ] Client-side validation: title required, deadline must be in future
- [ ] Submit → `POST /challenges` or `PATCH /challenges/:id` → redirect to detail on success
- [ ] Error Toast on API failure
- [ ] Typecheck passes
- [ ] Verify in browser: markdown editor renders, form submits and saves

---

### Phase 3 — Enrollment

**OpenSpec change proposal:** Define `POST /challenges/:id/enroll`, `DELETE /challenges/:id/enroll`, `GET /me/enrollments`.

---

#### US-008: BE — Enrollment CRUD + constraints
**Description:** As a developer, I need enrollment endpoints with business rule enforcement so the platform controls who joins which challenges.

**Acceptance Criteria:**
- [ ] `enrollments` table: `id`, `challenge_id (FK)`, `user_id (FK)`, `status (enum: in_progress|submitted|approved|rejected)`, `enrolled_at`
- [ ] `POST /challenges/:id/enroll` — authenticated; returns 409 if already enrolled; returns 409 if `max_enrollments` reached; returns 400 if challenge is closed
- [ ] `DELETE /challenges/:id/enroll` — enrolled user can withdraw if status is `in_progress`
- [ ] `GET /me/enrollments` — returns current user's enrollments with challenge summary
- [ ] Typecheck passes

#### US-009: FE — Enroll/withdraw UI + my enrollments dashboard section
**Description:** As a user, I want to enroll in a challenge and see my enrolled challenges.

**Acceptance Criteria:**
- [ ] Challenge detail page shows "Enroll" button for non-enrolled users; "Withdraw" for enrolled users with `in_progress` status; "Enrolled ✓" (disabled) for submitted/approved
- [ ] "Enroll" triggers `POST /challenges/:id/enroll`; success shows Toast + button state changes without page reload
- [ ] `/me` page: "My Challenges" section lists enrolled challenges with status badge
- [ ] Typecheck passes
- [ ] Verify in browser: enroll/withdraw cycle works, dashboard updates

---

### Phase 4 — Submissions

**OpenSpec change proposal:** Define `POST /enrollments/:id/submissions`, `GET /enrollments/:id/submissions`, `GET /submissions/:id`.

---

#### US-010: BE — Submission upload (Azurite local) + external URL
**Description:** As a developer, I need submission endpoints that accept file uploads (stored in Azurite locally) or external URLs.

**Acceptance Criteria:**
- [ ] `submissions` table: `id`, `enrollment_id (FK)`, `blob_url (nullable)`, `external_url (nullable)`, `notes (text)`, `submitted_at`; one of `blob_url` or `external_url` must be set
- [ ] `POST /enrollments/:id/submissions` — multipart (file) or JSON (`{ external_url, notes }`)
- [ ] Files uploaded to Azurite container `submissions/{userId}/{enrollmentId}/{filename}`; connection string from env
- [ ] Accepted MIME types: PDF, PNG, JPG, ZIP, Markdown; max 25 MB; returns 422 otherwise
- [ ] On submit, updates `enrollment.status` to `submitted`
- [ ] `GET /enrollments/:id/submissions` — returns list of submissions for the enrollment
- [ ] Typecheck passes

#### US-011: FE — Submission upload + display
**Description:** As an enrolled user, I want to upload my output to mark a challenge as completed.

**Acceptance Criteria:**
- [ ] On challenge detail, enrolled users see a "Submit Output" panel (hidden for non-enrolled)
- [ ] PrimeVue FileUpload component (drag-drop, progress bar) for file upload
- [ ] Toggle to switch to "External URL" mode (text input + notes textarea)
- [ ] On success: submission appears in a list below the upload panel; enrollment status badge updates to "Submitted"
- [ ] Error Toast with clear message on failure (file too large, wrong type)
- [ ] Typecheck passes
- [ ] Verify in browser: upload file, check Azurite storage; paste external URL; both modes work

---

### Phase 5 — Review & Approval

**OpenSpec change proposal:** Define `GET /challenges/:id/submissions`, `POST /submissions/:id/approve`, `POST /submissions/:id/reject`.

---

#### US-012: BE — Approve/reject submissions
**Description:** As a developer, I need review endpoints so challenge owners can verify and close submissions.

**Acceptance Criteria:**
- [ ] `POST /submissions/:id/approve` — owner only; sets `enrollment.status = approved`; returns 403 for non-owner
- [ ] `POST /submissions/:id/reject` — owner only; body: `{ reason?: string }`; sets status = `rejected`
- [ ] `GET /challenges/:id/submissions` — owner only; returns all submissions for all enrollments of the challenge (with user info)
- [ ] Typecheck passes

#### US-013: FE — Review UI for challenge owners
**Description:** As a challenge owner, I want to review submissions and approve or reject them.

**Acceptance Criteria:**
- [ ] Challenge detail page: owners see a "Submissions" tab listing all submitted outputs (submitter name, file/URL, notes)
- [ ] Each submission row has "Approve" (green) and "Reject" (red) buttons
- [ ] "Reject" opens a Dialog with an optional reason textarea
- [ ] Status badge updates immediately on action (optimistic UI)
- [ ] Typecheck passes
- [ ] Verify in browser: full approve/reject flow works end-to-end

---

### Phase 6 — Activity Feed & Dashboard

**OpenSpec change proposal:** Define `GET /activity/recent`, `GET /activity/me`.

---

#### US-014: BE — Activity event logging (Postgres for local dev)
**Description:** As a developer, I need an activity log so the FE can display what's happening on the platform.

**Acceptance Criteria:**
- [ ] `activity_events` table: `id`, `user_id (FK)`, `event_type (enum: challenge_created|enrolled|submitted|approved|rejected)`, `payload (jsonb)`, `created_at`
- [ ] Events written in NestJS service layer at: challenge create, enroll, submit, approve, reject
- [ ] `GET /activity/recent` — returns last 50 events across all users; public (no auth required)
- [ ] `GET /activity/me` — returns current user's last 50 events; auth required
- [ ] Typecheck passes

> **Azure migration note:** In Phase 7, `activity_events` table is migrated to Cosmos DB (same API, different persistence).

#### US-015: FE — Activity feed + full dashboard
**Description:** As a user, I want a dashboard showing my progress and a live activity feed from the whole organization.

**Acceptance Criteria:**
- [ ] `/me` page: profile card (avatar, name, email), stats (challenges created, enrolled, approved), "My Challenges" list (from Phase 3)
- [ ] Activity feed panel: organization-wide timeline using `GET /activity/recent`; shows event icon, user avatar, action text, relative time
- [ ] Feed refreshes every 30 seconds
- [ ] Typecheck passes
- [ ] Verify in browser: dashboard renders full data, feed auto-refreshes

---

### Phase 7 — Azure Infrastructure & Deployment

> **Starting point:** BE + FE are feature-complete and verified locally.
> Phases 7a–7d deploy progressively; each step must be verified before proceeding.

---

#### Phase 7a — Core Infrastructure (Terraform)

#### US-016: Terraform — Core Azure resources
**Description:** As a developer, I need all Azure resources defined as Terraform so the environment is reproducible and teardown/rebuild is possible in < 30 min.

**Acceptance Criteria:**
- [ ] `infra/` directory with Terraform modules: `resource_group`, `postgres`, `storage`, `key_vault`, `app_insights`, `cosmos`, `acr`
- [ ] Resources provisioned:
  - Resource Group
  - Azure Database for PostgreSQL Flexible Server (Burstable B1ms)
  - Storage Account (LRS, containers: `submissions`, `reports`)
  - Key Vault (Standard tier)
  - Application Insights + Log Analytics workspace
  - Cosmos DB account (Serverless) + containers: `activity_events` (partition `/userId`), `submission_events` (partition `/submissionId`)
  - Azure Container Registry (Basic tier) — required by Phase 7c Container Apps
- [ ] Key Vault secrets populated: DB connection string, Storage connection string, Cosmos DB key, Google OAuth client ID+secret, JWT private key
- [ ] `terraform plan` runs with no errors; `terraform apply` provisions all resources
- [ ] `terraform destroy` cleanly removes all resources

#### US-017: Deploy NestJS to App Service
**Description:** As a developer, I need to deploy the NestJS backend to Azure App Service.

**Acceptance Criteria:**
- [ ] Terraform provisions App Service Plan (B1 Linux, Node 24) + App Service
- [ ] App Service uses Managed Identity to read secrets from Key Vault via `@Microsoft.KeyVault(...)` app settings
- [ ] `AZURE_POSTGRESQL_CONNECTION_STRING` and `AZURE_STORAGE_CONNECTION_STRING` injected from Key Vault
- [ ] GitHub Actions workflow: lint → build → deploy on push to `main`
- [ ] `GET https://<app>.azurewebsites.net/health` returns `{ status: "ok" }`
- [ ] App Insights instrumentation key wired; requests visible in Portal

#### US-018: Deploy Vue to Static Web Apps
**Description:** As a developer, I need to deploy the Vue frontend to Azure Static Web Apps.

**Acceptance Criteria:**
- [ ] Terraform provisions Azure Static Web App (Free tier)
- [ ] GitHub Actions workflow: `yarn build` → deploy; `VITE_API_URL` set to APIM URL
- [ ] Frontend accessible at `<staticwebapp>.azurestaticapps.net`
- [ ] SPA routing works (404 → serve `index.html`)

---

#### Phase 7b — Serverless (Azure Functions)

#### US-019: Azure Function — Blob-triggered submission scanner
**Description:** As the system, I need to validate uploaded files automatically so invalid submissions are flagged without manual review.

**Acceptance Criteria:**
- [ ] Python Azure Function (v2 model), `@app.blob_trigger` on `submissions` container
- [ ] Reads blob; validates MIME type and size ≤ 25 MB
- [ ] Writes validation result event to Cosmos DB `submission_events` container (partition key `/submission_id`)
- [ ] If invalid: calls NestJS webhook `POST /internal/submissions/:id/invalidate`
- [ ] Deployed to Consumption plan via GitHub Actions
- [ ] Invocations visible in Application Insights

#### US-020: Azure Function — Weekly skill gap report (Timer)
**Description:** As an org leader, I want an automated weekly report so I know which skills remain unfilled.

**Acceptance Criteria:**
- [ ] Python Azure Function (v2 model), `@app.timer_trigger` with schedule `0 0 9 * * 1` (Monday 9 AM UTC+7 = 2 AM UTC)
- [ ] Queries Azure Postgres for `open` challenges with enrollment rate < 50%
- [ ] Generates JSON report: `{ generated_at, challenges: [{ id, title, required_skills, enrolled, max }] }`
- [ ] Writes report to Blob Storage `reports/weekly-{YYYY-MM-DD}.json`
- [ ] Deployed to Consumption plan

---

#### Phase 7c — Container Apps + Activity Migration

#### US-021: Container App — Thumbnail preview service (Node.js)
**Description:** As a user, I want to see a thumbnail preview of uploaded files so I can quickly scan submissions.

**Acceptance Criteria:**
- [ ] Node 24 microservice: `POST /thumbnail` accepts `{ blobUrl }`, returns thumbnail PNG (256×256)
- [ ] Uses `sharp` for images; `pdf-thumbnail` for PDFs; returns placeholder SVG for other types
- [ ] Containerized (Dockerfile) and pushed to Azure Container Registry
- [ ] Deployed to Azure Container Apps (min 0, max 3 replicas — scale-to-zero)
- [ ] NestJS calls this service after submission upload; stores `thumbnail_url` on submission record
- [ ] FE displays thumbnail in submission list (Phase 4 US-011 updated to show thumbnail)

#### US-022: Migrate activity events to Cosmos DB
**Description:** As an architect, I want activity events stored in Cosmos DB so the platform demonstrates NoSQL integration.

> Cosmos DB and containers are already provisioned in US-016. This US only migrates the NestJS service layer.

**Acceptance Criteria:**
- [ ] NestJS `ActivityService` swapped: write/read Cosmos DB (`activity_events` container) instead of Postgres table
- [ ] Postgres `activity_events` table dropped via TypeORM migration
- [ ] `GET /activity/recent` and `GET /activity/me` still return same response shape — no FE changes needed
- [ ] FE works with zero changes

---

#### Phase 7d — APIM + CI/CD + Observability

#### US-023: API Management — Gateway + Developer Portal
**Description:** As an architect, I want all traffic to flow through APIM with a developer portal for documentation.

**Acceptance Criteria:**
- [ ] APIM instance (Consumption tier) provisioned via Terraform
- [ ] App Service (NestJS) registered as backend; all `/api/*` routes proxied
- [ ] Container App (thumbnail service) registered as backend; `/thumbnail/*` proxied
- [ ] Policies: rate limit 100 calls/min per IP; JWT validation via `validate-jwt` policy; CORS for Static Web App origin
- [ ] OpenAPI spec imported from NestJS Swagger endpoint → powers Developer Portal
- [ ] Developer Portal enabled and accessible at `https://<apim>.developer.azure-api.net`
- [ ] FE `VITE_API_URL` updated to APIM public URL

#### US-024: Application Insights — Custom telemetry + distributed tracing
**Description:** As an operator, I need end-to-end observability so I can diagnose production issues.

**Acceptance Criteria:**
- [ ] Custom telemetry events tracked in NestJS: `challenge.created`, `enrollment.created`, `submission.uploaded`, `submission.approved`, `submission.rejected`
- [ ] Distributed tracing correlation ID propagated: APIM → App Service → Container App
- [ ] Azure Functions linked to same App Insights workspace
- [ ] Dashboard in Portal: request rate, failures, avg latency, custom events timeline
- [ ] Alert rule: notify (email) if 5xx rate > 5% in any 5-minute window

#### US-025: GitHub Actions — Full CI/CD pipeline
**Description:** As a developer, I want automated builds and deploys so every push to `main` is validated and shipped.

**Acceptance Criteria:**
- [ ] `.github/workflows/backend.yml`: lint → typecheck → test → build → deploy to App Service
- [ ] `.github/workflows/frontend.yml`: typecheck → build → deploy to Static Web Apps
- [ ] `.github/workflows/functions.yml`: lint → deploy Azure Functions
- [ ] `.github/workflows/container-app.yml`: build Docker → push ACR → update Container App revision
- [ ] All secrets stored in GitHub Actions secrets; zero secrets in code or committed env files
- [ ] All 4 workflows pass on `main` before project is considered complete

---

## 5. Functional Requirements

- **FR-1:** Google OAuth restricted to `@vitalify.asia` emails; any other domain returns HTTP 403.
- **FR-2:** Users create, edit (owner only), and soft-delete (owner only) challenges with markdown description and skill tags.
- **FR-3:** Users browse and filter all challenges by status and skill.
- **FR-4:** Users enroll in challenges; cannot enroll twice or beyond `max_enrollments`; cannot enroll in closed challenges.
- **FR-5:** Enrolled users upload submission files (PDF/PNG/JPG/ZIP/MD ≤ 25 MB) or external URLs.
- **FR-6:** Challenge owners approve or reject submissions with an optional rejection reason.
- **FR-7:** Submissions are automatically scanned by a Blob-triggered Azure Function for type/size validation.
- **FR-8:** A weekly timer function generates a skill gap report and drops it to Blob Storage every Monday.
- **FR-9:** Container App generates thumbnail previews for PDF/image submissions.
- **FR-10:** Activity events are recorded for key actions and displayed in a real-time feed on the dashboard.
- **FR-11:** On Azure: all traffic enters through APIM with rate limiting and JWT validation.
- **FR-12:** All secrets are retrieved from Key Vault via Managed Identity; no secrets in code or env files.
- **FR-13:** Application Insights captures custom telemetry and distributed traces.
- **FR-14:** All Azure resources defined in Terraform; environment is reproducible from `terraform apply`.

---

## 6. Non-Goals (Out of Scope)

- No multi-tenancy (single org).
- No email notifications (reports dropped to Blob only).
- No real-time chat or WebSocket features.
- No mobile app (responsive web only).
- No AI skill-matching or recommendations.
- No video upload / streaming.
- No file moderation for inappropriate content.
- No advanced gamification (leaderboards, badges, points) in v1.
- No public API access beyond the Vue FE.

---

## 7. Architecture Overview

```
                 ┌────────────────────────────────┐
                 │  Vue 3 + PrimeVue              │
                 │  Azure Static Web Apps (Free)  │
                 └───────────────┬────────────────┘
                                 │
                                 ▼
                 ┌────────────────────────────────┐
                 │  API Management (Consumption)  │
                 │  Rate limit · JWT · CORS       │
                 │  Developer Portal              │
                 └──────────────┬─────────────────┘
                    ┌───────────┴──────────┐
                    ▼                      ▼
        ┌───────────────────┐   ┌──────────────────────┐
        │  NestJS           │   │  Container Apps      │
        │  App Service (B1) │   │  Thumbnail Service   │
        │  Node 24 Linux    │   │  Node 24             │
        └──────┬────────────┘   └──────┬───────────────┘
                                       │ image pull
                               ┌───────▼───────────────┐
                               │  Container Registry   │
                               │  (ACR Basic)          │
                               └───────────────────────┘
               │
    ┌──────────┼──────────┬──────────────┐
    ▼          ▼          ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│Postgres│ │ Blob   │ │Cosmos DB │ │Key Vault │
│Flexible│ │Storage │ │Serverless│ │(secrets) │
│Server  │ │LRS     │ │          │ │          │
└────────┘ └───┬────┘ └──────────┘ └──────────┘
               │ blob trigger (upload)
               ▼
      ┌────────────────────┐
      │  Azure Functions   │
      │  · Blob scanner    │
      │  · Weekly report   │
      │  (Consumption)     │
      └────────────────────┘

     All services → Application Insights
```

---

## 8. Data Model

### PostgreSQL (primary relational data)
```
users           (id, email UNIQUE, name, avatar_url, created_at)
challenges      (id, owner_id FK, title, description, required_skills TEXT[],
                 deadline, max_enrollments, status, created_at, deleted_at)
enrollments     (id, challenge_id FK, user_id FK, status, enrolled_at)
submissions     (id, enrollment_id FK, blob_url, external_url,
                 thumbnail_url, notes, submitted_at)
```

### Cosmos DB (activity log — added in Phase 7c)
```
activity_events  partition key: /userId
  { id, userId, eventType, payload, createdAt }
submission_events  partition key: /submissionId
  { id, submissionId, validationResult, processedAt }
```

---

## 9. Local Development Setup

> **Toolchain:** Node 24.13.0 (`nvm use`) and yarn 1.22.22. Do not use npm.

```bash
# Start all local services
docker compose up -d
# postgres:16 on :5432, pgAdmin on :5050, Azurite on :10000-10002

# Backend
cd backend && yarn install && yarn migration:run && yarn start:dev

# Frontend
cd frontend && yarn install && yarn dev

# Azure Functions (local, separate terminal)
cd functions && pip install -r requirements.txt && func start
```

`.env` (backend):
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/skillplatform
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_PRIVATE_KEY=...
```

---

## 10. Estimated Azure Cost

| Resource | Tier | Cost/month |
|----------|------|-----------|
| App Service Plan + App | B1 Linux | ~$13 |
| PostgreSQL Flexible Server | Burstable B1ms | ~$12 |
| Cosmos DB | Serverless | ~$1 |
| Blob Storage | LRS Standard | ~$1 |
| Azure Functions | Consumption | $0 (1M free) |
| Container Apps | Scale-to-zero | ~$0 |
| APIM | Consumption | $0 (1M free calls) |
| Static Web Apps | Free | $0 |
| Container Registry | Basic | ~$5 |
| App Insights + Logs | Pay-per-GB | ~$2 |
| Key Vault | Standard | ~$0 |
| **Total** | | **~$34/month** |

> Set a Budget Alert at $80 on the student subscription.

---

## 11. Success Metrics

- Full E2E flow works on Azure: sign in → create challenge → enroll → upload → review → see activity feed.
- Every Azure service from the 2-week plan appears with clear architectural purpose.
- `terraform apply` from scratch provisions the full environment in < 30 minutes.
- CI/CD: all 4 GitHub Actions workflows pass on `main`.
- APIM Developer Portal shows documented API from OpenSpec.
- Application Insights: distributed traces link APIM → App Service → Container App.
- Monthly Azure cost stays under $40.

---

## 12. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Google OAuth: passport or Entra External ID? | `passport-google-oauth20` directly |
| APIM Developer Portal? | Yes — include it |
| SQL passwordless or Key Vault conn string? | Key Vault connection string (simpler) |
| Container App runtime? | Node.js |
| Weekly report: email or Blob? | Drop to Blob only |
| File moderation? | Out of scope for v1 |

---

**Next step:** Generate task breakdown in `tasks/tasks-prd-skill-challenge-platform.md` and start Phase 0 (US-001: NestJS scaffold).
