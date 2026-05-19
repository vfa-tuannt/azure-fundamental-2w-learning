## Why

Phase 2 delivered the challenge catalogue, but the platform is still a one-sided notice board: members can post challenges, nobody can join one. Phase 3 closes the loop by letting members enroll, withdraw, and see what they've signed up for — turning the catalogue into a participation system. It also retires the Phase-2 `enrollmentsCount: 0` placeholder by wiring the real count, which is a prerequisite for Phase 4 (submissions) and Phase 6 (activity feed dashboard).

## What Changes

- Add an `enrollments` table (`id uuid PK`, `challenge_id uuid FK challenges`, `user_id uuid FK users`, `status enum: in_progress|submitted|approved|rejected default in_progress`, `enrolled_at timestamptz default now()`) with a TypeORM migration
- Add a partial unique constraint `(challenge_id, user_id)` to prevent duplicate enrollments at the DB level
- Add an index on `(user_id, enrolled_at DESC)` to keep `GET /me/enrollments` fast
- Add backend endpoints:
  - `POST /challenges/:id/enroll` — authenticated; returns 201 with the new enrollment; **409 if already enrolled**; **409 if `max_enrollments` reached** (counting only non-`rejected` rows); **400 if challenge is closed**; **404 if the challenge does not exist or is soft-deleted**
  - `DELETE /challenges/:id/enroll` — authenticated; **204** if the caller has an `in_progress` enrollment that is hard-deleted; **409 if status is not `in_progress`** (already submitted/approved/rejected); **404 if no enrollment for that user/challenge**
  - `GET /me/enrollments` — authenticated; returns the caller's enrollments newest-first with an embedded challenge summary (`id, title, deadline, status, requiredSkills`)
- Add a `GET /challenges/:id/enrollment` helper — authenticated; returns the caller's enrollment for the given challenge (or 404) so the detail page can render the correct enroll/withdraw/disabled state
- Update `GET /challenges` and `GET /challenges/:id`: replace the Phase-2 hard-coded `enrollmentsCount: 0` with a real count derived from `enrollments` (counting only non-`rejected` rows), via a `LEFT JOIN LATERAL` / subquery so list pagination still works
- Add an `EnrollmentsModule` (controller + service + DTOs) and a TypeORM `Enrollment` entity FK'd to `Challenge` and `User`; service-layer enforcement of the business rules (closed challenge, max enrollments, duplicate)
- Add frontend `Enrollment` API types and a typed `enrollmentsApi` client in `frontend/src/api/enrollments.ts` (`enroll(challengeId)`, `withdraw(challengeId)`, `getMyEnrollments()`, `getMyEnrollmentForChallenge(challengeId)`)
- Add a Pinia `enrollmentsStore` that caches the caller's enrollment-per-challenge map and the `/me` list, exposing actions that mutate state optimistically on success and roll back on error
- Update `frontend/src/views/ChallengeDetailView.vue`: show an enrollment action button — **"Enroll"** if not enrolled, **"Withdraw"** if enrolled with `in_progress`, **"Enrolled (Submitted)"** / **"Enrolled (Approved)"** / **"Enrolled (Rejected)"** (disabled) otherwise; clicking calls the store, shows a Toast, and updates the button without reloading the page; the count chip uses the real `enrollmentsCount` field
- Update `frontend/src/views/MeView.vue`: render a profile header (avatar + name + email from the auth store) and a "My Challenges" PrimeVue DataTable backed by `GET /me/enrollments`, with columns Title, Skills, Deadline, Status (enrollment status badge); row click navigates to the challenge detail
- Hide the enroll button for the challenge's own `owner_id` (you can't enroll in your own challenge); show a small "You own this challenge" hint instead

## Capabilities

### New Capabilities
- `backend-enrollments`: Enrollment entity and table, enroll/withdraw/list endpoints, business-rule enforcement (closed challenge, max enrollments, duplicate, owner-of-status), DTO shape, owner-self-enroll rule
- `frontend-enrollments`: Enrollment API client, Pinia store, enroll/withdraw button on the challenge detail page, "My Challenges" section on `/me`

### Modified Capabilities
- `backend-challenges`: `enrollmentsCount` is no longer a hard-coded `0` placeholder — list and detail endpoints return the real count derived from the `enrollments` table (excluding `rejected` rows); the DTO shape does not change

## Impact

- **Backend**: new `EnrollmentsModule` with controller, service, DTOs; new `Enrollment` entity; new TypeORM migration adding the `enrollments` table with FKs to `users.id` and `challenges.id` (both `ON DELETE RESTRICT`), a `(challenge_id, user_id)` unique constraint, an `enrollment_status` Postgres enum, and an index on `(user_id, enrolled_at DESC)`; the `ChallengesService` learns to compute `enrollmentsCount` via a subquery — its public method signatures do not change
- **Frontend**: new files `src/api/enrollments.ts`, `src/stores/enrollments.ts`; rewrite `src/views/MeView.vue`; surgical edits to `src/views/ChallengeDetailView.vue`; no new dependencies
- **Database**: new `enrollments` table and `enrollment_status` enum; the existing `challenges` table is unchanged, but its rows are now joined against `enrollments` on every list query — the existing `(status, deleted_at, created_at DESC)` index plus the new `(challenge_id)` FK index on `enrollments` keep this fast
- **Auth**: existing `JwtAuthGuard` is reused for all enrollment mutations and the `/me/enrollments` read; no new auth surface
- **No breaking changes** to Phase 0/1/2 — `GET /challenges` and `GET /challenges/:id` keep the same response shape; the value of `enrollmentsCount` simply becomes meaningful
- **Forward-compat note for Phase 4 (submissions)**: enrollment status `submitted`/`approved`/`rejected` is reserved and used by this phase only as a *guard* on withdraw — the actual transitions into those states are owned by Phase 4 (submission upload) and Phase 5 (review). The schema already supports them so no migration is needed in later phases.
