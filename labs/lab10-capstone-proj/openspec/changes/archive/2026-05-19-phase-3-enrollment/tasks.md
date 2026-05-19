## 1. Backend — Dependencies and Environment

- [x] 1.1 Verify TypeORM, `class-validator`, `class-transformer`, and `@nestjs/mapped-types` are already in `backend/package.json` (from Phase 2) — no new packages needed
- [x] 1.2 Confirm `backend/.env` is loaded with the existing `DATABASE_URL` (no new env vars needed)

## 2. Backend — Enrollment Entity and Module

- [x] 2.1 Create `EnrollmentStatus` enum (`in_progress`, `submitted`, `approved`, `rejected`) at `backend/src/enrollments/enrollment-status.enum.ts`
- [x] 2.2 Create `Enrollment` entity at `backend/src/enrollments/enrollment.entity.ts` with columns `id` (uuid PK), `challengeId` (uuid, column `challenge_id`), `userId` (uuid, column `user_id`), `status` (enum, column `status`, default `in_progress`), `enrolledAt` (timestamptz, column `enrolled_at`, default `now()`); `@ManyToOne` to `Challenge` and `User` with `onDelete: 'RESTRICT'`; class-level `@Unique(['challengeId', 'userId'])`; class-level `@Index('IDX_enrollments_user_enrolled', ['userId', 'enrolledAt'])` and `@Index('IDX_enrollments_challenge', ['challengeId'])`
- [x] 2.3 Add `Enrollment` to the entities array in `backend/src/app.module.ts` and `backend/src/data-source.ts`
- [x] 2.4 Create DTOs in `backend/src/enrollments/dto/`: `enrollment.dto.ts` (TypeScript interface for the bare DTO), `my-enrollment.dto.ts` (interface extending bare DTO with embedded `challenge` summary)
- [x] 2.5 Create `EnrollmentsModule` at `backend/src/enrollments/enrollments.module.ts` importing `TypeOrmModule.forFeature([Enrollment, Challenge])` and exporting `EnrollmentsService`
- [x] 2.6 Register `EnrollmentsModule` in `AppModule`

## 3. Backend — Enrollments Service (Business Logic)

- [x] 3.1 Create `EnrollmentsService` at `backend/src/enrollments/enrollments.service.ts` with injected `Repository<Enrollment>`, `Repository<Challenge>`, and `DataSource` (for transaction management)
- [x] 3.2 Implement `enroll(challengeId, userId)`: open a `SERIALIZABLE` transaction → load challenge (404 if missing or `deleted_at IS NOT NULL`) → 400 if `status === 'closed'` → 400 if `ownerId === userId` → check existing enrollment for `(challengeId, userId)` (409 if found) → count non-rejected enrollments for the challenge (409 if `maxEnrollments != null && count >= maxEnrollments`) → insert new row with `status: in_progress` → return the bare DTO
- [x] 3.3 Translate the unique-constraint violation thrown by Postgres on concurrent same-user enroll into HTTP 409 (`ConflictException`) inside the transaction wrapper
- [x] 3.4 Implement `withdraw(challengeId, userId)`: load enrollment for `(challengeId, userId)` (404 if missing) → 409 if `status !== 'in_progress'` → hard-delete the row via `repository.remove(entity)`
- [x] 3.5 Implement `findMyEnrollment(challengeId, userId)`: return the row or throw `NotFoundException`
- [x] 3.6 Implement `listMine(userId)`: query enrollments joined to challenges WHERE `enrollments.user_id = userId AND challenges.deleted_at IS NULL` ORDER BY `enrollments.enrolled_at DESC`; map to `MyEnrollmentDto` shape with embedded `challenge` summary
- [x] 3.7 Export from the service a public helper `countActiveForChallenge(challengeId)` (returns count of non-rejected enrollments) that `ChallengesService` can use — or expose a static utility — so the `enrollmentsCount` swap in §6 is testable in isolation

## 4. Backend — Enrollments and Me Controllers

- [x] 4.1 Create `EnrollmentsController` at `backend/src/enrollments/enrollments.controller.ts` with class-level `@Controller('challenges/:id')`
- [x] 4.2 Add `POST /challenges/:id/enroll`: `@UseGuards(JwtAuthGuard)`, `@HttpCode(201)`, `@Param('id', ParseUUIDPipe)`, body-less; calls `enrollmentsService.enroll(id, req.user.id)`; returns the new enrollment DTO
- [x] 4.3 Add `DELETE /challenges/:id/enroll`: `@UseGuards(JwtAuthGuard)`, `@HttpCode(204)`, `@Param('id', ParseUUIDPipe)`; calls `enrollmentsService.withdraw(id, req.user.id)`; returns nothing
- [x] 4.4 Add `GET /challenges/:id/enrollment`: `@UseGuards(JwtAuthGuard)`, `@Param('id', ParseUUIDPipe)`; calls `enrollmentsService.findMyEnrollment(id, req.user.id)`; returns the bare enrollment DTO or throws 404
- [x] 4.5 Create a new `MeController` at `backend/src/me/me.controller.ts` (or add to an existing one if more appropriate) with `@Controller('me')`
- [x] 4.6 Add `GET /me/enrollments`: `@UseGuards(JwtAuthGuard)`; calls `enrollmentsService.listMine(req.user.id)`; returns `MyEnrollmentDto[]`
- [x] 4.7 Register the new `MeController` in `AppModule` (or in a `MeModule` that imports `EnrollmentsModule` so the service is available)

## 5. Backend — Migration

- [x] 5.1 Run `yarn migration:generate -- ./src/migrations/CreateEnrollmentsTable` to scaffold the migration
- [x] 5.2 Hand-edit the generated migration: add the `enrollment_status` enum creation with explicit name; add the `(user_id, enrolled_at DESC)` composite index (TypeORM may emit it without `DESC` — fix); add the `(challenge_id)` index explicitly; verify FKs use `ON DELETE RESTRICT`; verify the unique constraint on `(challenge_id, user_id)` is present
- [x] 5.3 Verify `down()` drops the indexes, the unique constraint, the FKs, the table, and the `enrollment_status` enum type (in that order); add the `DROP TYPE` manually if missing
- [x] 5.4 Run `yarn migration:run` against local Docker Compose Postgres
- [x] 5.5 Verify with `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "\d enrollments"` that the table, indexes, unique constraint, and FKs are present

## 6. Backend — ChallengesService enrollmentsCount Swap

- [x] 6.1 In `ChallengesService.findAll()`, replace the `enrollmentsCount: 0` placeholder in the QueryBuilder with a correlated subquery: `addSelect` of `(SELECT COUNT(*) FROM enrollments e WHERE e.challenge_id = c.id AND e.status != 'rejected')` aliased as `enrollments_count`, then read it from the raw result
- [x] 6.2 In `ChallengesService.findOne()` (the by-id path used by `GET /challenges/:id`), use the same subquery so detail responses also have a real count
- [x] 6.3 Update `ChallengesService.toDto()` to read `enrollmentsCount` from the raw query result rather than hard-coding `0`
- [x] 6.4 Update any existing unit test that asserted `enrollmentsCount === 0` to either seed enrollments or accept the dynamic value

## 7. Backend — Tests

- [x] 7.1 Unit test `EnrollmentsService.enroll`: happy path (201, returns enrollment with `in_progress` status)
- [x] 7.2 Unit test `EnrollmentsService.enroll`: throws `NotFoundException` when challenge is missing or soft-deleted
- [x] 7.3 Unit test `EnrollmentsService.enroll`: throws `BadRequestException` when challenge status is `closed`
- [x] 7.4 Unit test `EnrollmentsService.enroll`: throws `BadRequestException` when caller is the challenge owner
- [x] 7.5 Unit test `EnrollmentsService.enroll`: throws `ConflictException` when caller is already enrolled
- [x] 7.6 Unit test `EnrollmentsService.enroll`: throws `ConflictException` when `maxEnrollments` cap is reached counting only non-rejected rows
- [x] 7.7 Unit test `EnrollmentsService.enroll`: a rejected enrollment does NOT count toward the cap (verify success when cap == non-rejected count + 1 rejected)
- [x] 7.8 Unit test `EnrollmentsService.withdraw`: happy path hard-deletes when status is `in_progress`
- [x] 7.9 Unit test `EnrollmentsService.withdraw`: throws `ConflictException` when status is `submitted`, `approved`, or `rejected`
- [x] 7.10 Unit test `EnrollmentsService.withdraw`: throws `NotFoundException` when no enrollment exists
- [x] 7.11 Unit test `EnrollmentsService.listMine`: returns rows ordered newest-first with embedded challenge summary; excludes enrollments whose challenge is soft-deleted
- [x] 7.12 E2E controller test (supertest): `POST /challenges/:id/enroll` returns 401 without token; 201 with valid token; 409 on duplicate
- [x] 7.13 E2E controller test: `DELETE /challenges/:id/enroll` returns 204 on in_progress; 409 when status not in_progress; 404 when not enrolled
- [x] 7.14 E2E controller test: `GET /me/enrollments` returns 401 without token; array with embedded challenge with valid token
- [x] 7.15 E2E controller test: `GET /challenges/:id/enrollment` returns the bare DTO when enrolled; 404 when not enrolled
- [x] 7.16 Test that `GET /challenges` and `GET /challenges/:id` return the real `enrollmentsCount` (seed 2 in_progress + 1 rejected for one challenge → expect `enrollmentsCount: 2`)

## 8. Backend — Gates

- [x] 8.1 Run `yarn lint` — must exit clean
- [x] 8.2 Run `yarn test` — all unit + E2E tests pass
- [x] 8.3 Run `yarn tsc --noEmit` — no TypeScript errors

## 9. Frontend — Types

- [x] 9.1 Extend `frontend/src/api/types.ts` with `EnrollmentStatus = 'in_progress' | 'submitted' | 'approved' | 'rejected'`
- [x] 9.2 Add `Enrollment { id: string; challengeId: string; userId: string; status: EnrollmentStatus; enrolledAt: string }`
- [x] 9.3 Add `MyEnrollment` extending `Enrollment` with `challenge: { id, title, deadline, status, requiredSkills }` (re-use the existing `ChallengeStatus` type)

## 10. Frontend — API Client

- [x] 10.1 Create `frontend/src/api/enrollments.ts` exporting `enroll(challengeId)`, `withdraw(challengeId)`, `getMyEnrollments()`, `getMyEnrollmentForChallenge(challengeId)`
- [x] 10.2 Implement `getMyEnrollmentForChallenge` to catch HTTP 404 and resolve to `null` (instead of throwing) so callers can use the absence as a normal state
- [x] 10.3 All other wrappers throw on non-2xx so the caller's try/catch can show a Toast

## 11. Frontend — Pinia Store

- [x] 11.1 Create `frontend/src/stores/enrollments.ts` with state `byChallengeId: Map<string, Enrollment | null>`, `myList: MyEnrollment[]`, `myListLoaded: boolean`, `loading`, `error`
- [x] 11.2 Action `loadForChallenge(challengeId)`: fetch and store the result in the map (null for 404)
- [x] 11.3 Action `loadMyList()`: fetch `GET /me/enrollments` and store in `myList`; set `myListLoaded = true`
- [x] 11.4 Action `enroll(challengeId)`: call API, on success set `byChallengeId.set(challengeId, result)` and invalidate `myListLoaded` (so the next visit to `/me` re-fetches); on failure set `error` and re-throw so the view can show a Toast
- [x] 11.5 Action `withdraw(challengeId)`: call API, on success set `byChallengeId.set(challengeId, null)` and invalidate `myListLoaded`; on failure set `error` and re-throw
- [x] 11.6 Action `reset()`: clear the map, the list, the flags
- [x] 11.7 Wire `authStore.logout()` (or its successor in this codebase) to call `enrollmentsStore.reset()` so a re-login doesn't see stale state

## 12. Frontend — ChallengeDetailView Update

- [x] 12.1 In `frontend/src/views/ChallengeDetailView.vue`, on mount, call `enrollmentsStore.loadForChallenge(:id)` when `authStore.isAuthenticated` is true
- [x] 12.2 Compute a reactive `buttonState` from `(authStore, challenge, enrollmentsStore.byChallengeId.get(:id))` that returns one of: `owner-hint` | `sign-in-cta` | `enroll-enabled` | `full-disabled` | `closed-disabled` | `withdraw-enabled` | `terminal-submitted` | `terminal-approved` | `terminal-rejected`
- [x] 12.3 Render the appropriate PrimeVue Button (or text) for each state using the design D11 matrix
- [x] 12.4 Wire Enroll click to `enrollmentsStore.enroll(:id)`; on success show a green Toast `"Enrolled in challenge"` and locally increment `challenge.enrollmentsCount`; on failure show a red Toast with the backend error message
- [x] 12.5 Wire Withdraw click to open a PrimeVue `ConfirmDialog` (`"Withdraw from this challenge?"`); on accept call `enrollmentsStore.withdraw(:id)`, show Toast, and locally decrement `challenge.enrollmentsCount`
- [x] 12.6 Update the existing enrollment count chip to read from the (now live) `challenge.enrollmentsCount` and `challenge.maxEnrollments` — no template change needed, but verify the binding still works after the store-driven increments/decrements
- [x] 12.7 Remove or update any Phase-2 test/snapshot that asserted on `enrollmentsCount: 0`

## 13. Frontend — MeView Rewrite

- [x] 13.1 Rewrite `frontend/src/views/MeView.vue` with `<script setup lang="ts">`
- [x] 13.2 Render a profile header section using `authStore.user.avatarUrl` (with initials fallback), `authStore.user.name`, and `authStore.user.email`
- [x] 13.3 On mount, call `enrollmentsStore.loadMyList()` if `myListLoaded` is false
- [x] 13.4 Render a PrimeVue `DataTable` bound to `enrollmentsStore.myList` with columns Title, Skills, Deadline, Status; the row's data shape is `MyEnrollment`
- [x] 13.5 Render Skills cells as `Tag` chips and Status cells as colored badges per design D11 (info / warning / success / danger)
- [x] 13.6 Wire row click to `router.push({ path: '/challenges/' + row.challenge.id })`
- [x] 13.7 Show an empty-state message (`"You haven't enrolled in any challenges yet"` + link to `/challenges`) when `myList.length === 0`
- [x] 13.8 Confirm the router entry for `/me` does NOT have `meta.public: true` (it must remain auth-gated by the existing guard)

## 14. Frontend — Gates

- [x] 14.1 Run `yarn type-check` — must exit clean
- [x] 14.2 Run `yarn build` — must exit clean

## 15. Browser Verification

- [x] 15.1 With two `@vitalify.asia` Google accounts in separate browsers, sign in to both; Account A creates a challenge with `max_enrollments: 1`
- [x] 15.2 Account B opens the detail page and clicks Enroll → confirm green Toast, count chip changes to `1/1`, button switches to Withdraw without a page reload
- [x] 15.3 Account A loads the same detail page → confirm "You own this challenge" hint and no Enroll button
- [x] 15.4 A third account opens the detail page → confirm a disabled "Full" button (cap reached)
- [x] 15.5 Account B clicks Withdraw, confirms the dialog → confirm count chip back to `0/1` and button switches back to Enroll
- [x] 15.6 Account B clicks Enroll again → confirm a fresh enrollment is created (no error from any stale state)
- [x] 15.7 Account A patches the challenge to `status: closed` → reload detail page on Account C → confirm a disabled "Closed" button
- [x] 15.8 Visit `/me` on Account B → confirm the profile header renders and the My Challenges table shows the enrollment with the correct title, skills, deadline, and status badge
- [x] 15.9 Account A soft-deletes the challenge → reload `/me` on Account B → confirm the enrollment row disappears from the list
- [x] 15.10 Refresh the detail page after enrolling → confirm the Withdraw button is still shown (proves the per-challenge fetch hydrates correctly on cold load)
- [x] 15.11 Open `/challenges` while signed out → confirm the `Enrolled/Max` column on every row shows the real count, not `0`
