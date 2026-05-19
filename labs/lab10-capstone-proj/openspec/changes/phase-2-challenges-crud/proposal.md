## Why

Phase 1 gave the platform an authenticated identity but nothing to do with it — every page is a placeholder and the `/challenges` route renders an empty shell. Phase 2 delivers the first business domain: members posting skill challenges and other members browsing them. This is the spine the rest of the product (enrollments, submissions, reviews, activity feed) hangs from. Without it, every later phase is blocked.

## What Changes

- Add a `challenges` table (`id`, `owner_id FK users`, `title`, `description text`, `required_skills text[]`, `deadline timestamptz`, `max_enrollments int nullable`, `status enum: open|closed`, `created_at`, `deleted_at`) with a TypeORM migration
- Add backend endpoints:
  - `POST /challenges` — authenticated; creates a challenge owned by the current user
  - `GET /challenges` — public; paginated (`?page=&limit=`); filterable by `?status=` and `?skill=`; response includes `enrollments_count` placeholder (always `0` until Phase 3)
  - `GET /challenges/:id` — public; full detail including `enrollments_count` placeholder
  - `PATCH /challenges/:id` — owner only; partial update of mutable fields
  - `DELETE /challenges/:id` — owner only; soft-delete via `deleted_at`
- Add a `ChallengesModule` (controller + service + DTOs) and a TypeORM `Challenge` entity FK'd to `User`
- Add `class-validator` / `class-transformer` and a global `ValidationPipe` (whitelist + transform); 400 on invalid input
- Add ownership enforcement: 403 when a non-owner tries to PATCH/DELETE; 404 for soft-deleted or non-existent rows
- Add frontend `Challenge` API types and a typed `challengesApi` client in `frontend/src/api/challenges.ts`
- Add a Pinia `challengesStore` for list state (page, filters, results, loading) and a thin per-detail loader
- Rewrite `frontend/src/views/ChallengesView.vue` as a PrimeVue DataTable: columns Title, Skills (chips), Deadline, Enrolled/Max, Status badge; filter bar (skill text input + status dropdown); pagination; "Create Challenge" button for authenticated users
- Rewrite `frontend/src/views/ChallengeDetailView.vue` to render full detail with markdown-rendered description, skill chips, deadline, owner; show "Edit" + "Delete" for the owner only
- Add `frontend/src/views/ChallengeFormView.vue` (mounted at `/challenges/new` and `/challenges/:id/edit`) with PrimeVue inputs and `md-editor-v3` for description; client-side validation (title required, deadline must be in future)
- Add routes `/challenges/new` and `/challenges/:id/edit`; both require auth via the existing guard
- Install `md-editor-v3` and wire its CSS

## Capabilities

### New Capabilities
- `backend-challenges`: Challenge entity, CRUD endpoints, ownership enforcement, validation, soft-delete, list filtering/pagination
- `frontend-challenges`: Challenge list page (DataTable + filters + pagination), detail page (markdown viewer), create/edit form (markdown editor + validation), router entries for `/challenges/new` and `/challenges/:id/edit`

### Modified Capabilities
- `frontend-scaffold`: the existing placeholder routes `/challenges` and `/challenges/:id` (declared in Phase 0) gain real views; two new routes (`/challenges/new`, `/challenges/:id/edit`) are added with explicit auth gating
- `frontend-auth`: the global navigation guard relaxes from a fixed allowlist (`/login`, `/auth/callback`) to a route-meta-driven policy (`meta.public === true` is public; everything else requires auth) so that `/challenges` and `/challenges/:id` can be browsed while logged out — matching the public BE endpoints

## Impact

- **Backend**: new modules `challenges/`; new entity `Challenge`; new dependencies `class-validator`, `class-transformer`; global `ValidationPipe` enabled in `main.ts`; new TypeORM migration adding the `challenges` table with a FK to `users` and a partial unique index is not needed
- **Frontend**: new files `src/api/challenges.ts`, `src/stores/challenges.ts`, `src/views/ChallengeFormView.vue`; updates to `src/views/ChallengesView.vue`, `src/views/ChallengeDetailView.vue`, `src/router/index.ts`; new dependency `md-editor-v3`
- **Database**: new `challenges` table with FK to `users.id` and a soft-delete column; index on `(status, deleted_at)` to keep list queries fast
- **Auth**: existing `JwtAuthGuard` is reused; no new auth surface
- **No breaking changes** to Phase 0/1 — public list/detail endpoints still work for unauthenticated visitors; protected mutations reuse the existing JWT
- **Forward-compat note for Phase 3**: `enrollments_count` is returned as `0` in this phase and will be populated by the enrollment service in Phase 3 without changing the response shape
