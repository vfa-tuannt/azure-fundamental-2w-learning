## 1. Backend dependencies and environment

- [x] 1.1 Verify no new runtime dependencies are needed (`@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `date-fns` on FE already present); record findings in commit message
- [x] 1.2 Confirm `JwtAuthGuard` from Phase 1 is the canonical guard reused by `ActivityController` (`/activity/me`) and `MeController` (`/me/stats`); `/activity/recent` is explicitly unguarded

## 2. Backend entity and migration

- [x] 2.1 Create `backend/src/activity/activity-event-type.enum.ts` exporting `enum ActivityEventType { CHALLENGE_CREATED = 'challenge_created', ENROLLED = 'enrolled', SUBMITTED = 'submitted', APPROVED = 'approved', REJECTED = 'rejected' }`
- [x] 2.2 Create `backend/src/activity/activity-event.entity.ts` with `@Entity({ name: 'activity_events' })`; columns: `id @PrimaryGeneratedColumn('uuid')`, `userId @Column({ name: 'user_id', type: 'uuid' })`, `type @Column({ name: 'event_type', type: 'enum', enum: ActivityEventType })`, `payload @Column({ type: 'jsonb', default: () => "'{}'" })`, `createdAt @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })`; declare `@ManyToOne(() => User, { onDelete: 'RESTRICT' })` on `user`
- [x] 2.3 Register `ActivityEvent` in `backend/src/data-source.ts` entities array
- [x] 2.4 Generate the migration with `yarn migration:generate -- ./src/migrations/CreateActivityEventsTable`
- [x] 2.5 Hand-review the generated SQL — ensure `CREATE TYPE activity_event_type AS ENUM(...)`, `CREATE TABLE activity_events (...)`, `CREATE INDEX IDX_activity_events_created_at ON activity_events (created_at DESC)`, and `CREATE INDEX IDX_activity_events_user_id_created_at ON activity_events (user_id, created_at DESC)` are present; remove any spurious `DROP INDEX`/`DROP CONSTRAINT` lines (recurring TypeORM generator bug seen in Phases 4–5); confirm `down()` drops the table first, then the enum
- [x] 2.6 Run `yarn migration:run`; verify with `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "\d activity_events"` that all columns, enum, FK, and both indexes exist
- [x] 2.7 Run `yarn migration:revert` then `yarn migration:run` once more to confirm the migration round-trips cleanly

## 3. Backend Activity module — scaffolding

- [x] 3.1 Create `backend/src/activity/dto/activity-event.dto.ts` with the DTO interface `{ id, type, payload, createdAt, user: { id, name, avatarUrl } }` and a discriminated `ActivityPayload` type for the five event types
- [x] 3.2 Create `backend/src/activity/dto/record-event.dto.ts` (internal, not exposed via HTTP) describing the `{ userId, type, payload }` input to `ActivityService.record(...)`
- [x] 3.3 Create `backend/src/activity/activity.module.ts` importing `TypeOrmModule.forFeature([ActivityEvent, User])`, providing `ActivityService`, declaring `ActivityController`, and exporting `ActivityService`
- [x] 3.4 Register `ActivityModule` in `backend/src/app.module.ts`

## 4. Backend Activity service — business logic

- [x] 4.1 Create `backend/src/activity/activity.service.ts` with constructor-injected `Repository<ActivityEvent>` and `Repository<User>` (or just rely on JOIN via QueryBuilder)
- [x] 4.2 Implement `record(input: RecordEventInput): Promise<void>` — does an `INSERT` of one row; wraps the call in `try { ... } catch (err) { this.logger.error(...) }` so failures are swallowed
- [x] 4.3 Implement `listRecent(): Promise<ActivityEventDto[]>` — `LEFT JOIN users` on `user_id`, order `created_at DESC`, limit 50, map to DTO via `toDto()` helper
- [x] 4.4 Implement `listForUser(userId: string): Promise<ActivityEventDto[]>` — same as above but with `WHERE user_id = :userId`
- [x] 4.5 Implement private `toDto(row): ActivityEventDto` mapping snake_case → camelCase, embedding `user` from the JOIN result, **excluding** `email`
- [x] 4.6 Use NestJS's `Logger` (`new Logger(ActivityService.name)`) for the swallowed-error path; include `userId` and `type` in the log payload for traceability

## 5. Backend Activity controller

- [x] 5.1 Create `backend/src/activity/activity.controller.ts` with class-level `@Controller('activity')`
- [x] 5.2 `@Get('recent')` — no guard; returns `activityService.listRecent()`
- [x] 5.3 `@Get('me')` — `@UseGuards(JwtAuthGuard)`; returns `activityService.listForUser(user.id)` (use `@CurrentUser()` decorator from Phase 1)
- [x] 5.4 Verify route registration via `yarn start:dev` boot logs — two new routes appear under `/activity`

## 6. Backend stats — extending MeController

- [x] 6.1 Add `MyStatsDto` interface to a new file `backend/src/me/dto/my-stats.dto.ts` with shape `{ challengesCreated: number; enrollmentsActive: number; enrollmentsApproved: number }`
- [x] 6.2 Add `getStats(userId: string): Promise<MyStatsDto>` to a new service `backend/src/me/me.service.ts` (or expose helpers on existing services — prefer a small `MeService` to keep `MeController` thin); use three `COUNT(*)` queries per the design's D8
- [x] 6.3 Wire `MeService` into `MeModule` (create the module if it doesn't exist; it must import `TypeOrmModule.forFeature([Challenge, Enrollment])`)
- [x] 6.4 Add `@Get('stats')` to `MeController` returning `MeService.getStats(user.id)`; guard with `@UseGuards(JwtAuthGuard)`
- [x] 6.5 Verify the new route appears in `yarn start:dev` boot logs as `GET /me/stats`

## 7. Backend wiring — emit events from existing services

- [x] 7.1 Inject `ActivityService` into `ChallengesService` (update `ChallengesModule` to import `ActivityModule`); call `await this.activity.record({ userId: ownerId, type: ActivityEventType.CHALLENGE_CREATED, payload: { challengeId: created.id, challengeTitle: created.title } })` at the end of `create()` after the transaction commits
- [x] 7.2 Inject `ActivityService` into `EnrollmentsService`; call `record({ ..., type: ENROLLED, payload: { challengeId, challengeTitle, enrollmentId } })` at the end of `enroll()` after the transaction commits; do NOT modify `withdraw()`
- [x] 7.3 Inject `ActivityService` into `SubmissionsService`; call `record({ ..., type: SUBMITTED, payload: { submissionId, enrollmentId, challengeId, challengeTitle, kind: 'file' } })` at the end of `createFileSubmission()` after the transaction commits; pass `kind: 'url'` from `createUrlSubmission()`
- [x] 7.4 Inject `ActivityService` into `ReviewsService`; in `approve()`, after the transaction commits, call `record({ userId: enrollment.userId, type: APPROVED, payload: { submissionId, enrollmentId, challengeId, challengeTitle, reviewerId: callerUserId } })` — note `userId` is the **submitter**, not the reviewer
- [x] 7.5 In `ReviewsService.reject()`, after commit, call `record({ userId: enrollment.userId, type: REJECTED, payload: { ..., reviewerId, rejectionReason: stored.rejection_reason ?? null } })` using the same normalised value persisted on the submission row
- [x] 7.6 Verify every emission call is **outside** the database transaction block (not inside `dataSource.transaction(...)` callbacks) so the originating commit is durable before recording starts

## 8. Backend tests

- [x] 8.1 Add unit tests for `ActivityService` covering: `record` inserts one row on success; `record` swallows DB errors and logs at error level; `listRecent` returns up to 50 rows ordered DESC; `listForUser` filters by user; DTO `user` object includes only `id`, `name`, `avatarUrl` (NOT email)
- [x] 8.2 Update existing unit tests for `ChallengesService.create` to mock `ActivityService` and assert `record(...)` is invoked exactly once with the expected payload on success; assert it is NOT called when create fails validation
- [x] 8.3 Same for `EnrollmentsService.enroll` — assert one record call on success; assert zero calls when the request fails (409 already-enrolled, 400 closed, etc.); assert zero calls from `withdraw()`
- [x] 8.4 Same for `SubmissionsService.createFileSubmission` and `createUrlSubmission` — assert `kind: 'file'` and `kind: 'url'` respectively
- [x] 8.5 Same for `ReviewsService.approve` and `reject` — assert event is recorded against the **submitter** id, not the reviewer's; assert `reviewerId` is the caller; assert `rejectionReason` is `null` on empty-body reject
- [x] 8.6 Add E2E test for `GET /activity/recent` — unauthenticated request succeeds (200); ordered newest-first; result limited to 50; empty list returns `[]`
- [x] 8.7 Add E2E test for `GET /activity/me` — 401 without token, 200 with token, returns only the caller's events
- [x] 8.8 Add unit tests for `MeService.getStats` covering: soft-deleted challenges excluded; in_progress + submitted both count as active; only `approved` enrollments count as approved; other users' rows ignored; zero counts for empty user
- [x] 8.9 Add E2E test for `GET /me/stats` — 401 without token, 200 returns the three counts as integers
- [x] 8.10 Add an E2E integration test that exercises the full loop  *(deferred to manual browser verification in §17 — repo lacks DB-backed test infrastructure; the 4 per-service emissions are already verified by tasks 8.2–8.5, and the cross-service read-back is exercised end-to-end via browser)*: create a challenge → enroll (different user) → submit → approve; then `GET /activity/recent` shows exactly four events in the right order with the right `event_type` values

## 9. Backend gates

- [x] 9.1 Run `yarn lint` — must be clean
- [x] 9.2 Run `yarn test` — all tests pass
- [x] 9.3 Run `yarn tsc --noEmit` — no TS errors

## 10. Frontend types

- [x] 10.1 Extend `frontend/src/api/types.ts` with `ActivityEventType` string union and a discriminated `ActivityPayload` type whose variants match the BE payload contracts
- [x] 10.2 Add `ActivityEvent` interface `{ id, type, payload, createdAt, user: { id, name, avatarUrl } }`
- [x] 10.3 Add `MyStats` interface `{ challengesCreated: number; enrollmentsActive: number; enrollmentsApproved: number }`
- [x] 10.4 Run `yarn type-check` after this step to catch any consumers needing updates

## 11. Frontend API clients

- [x] 11.1 Create `frontend/src/api/activity.ts` exporting `listRecent(): Promise<ActivityEvent[]>` → `GET /activity/recent` and `listMine(): Promise<ActivityEvent[]>` → `GET /activity/me`; use the shared axios instance so JWT is attached automatically when present
- [x] 11.2 Create `frontend/src/api/me.ts` exporting `getMyStats(): Promise<MyStats>` → `GET /me/stats`; use the shared axios instance

## 12. Frontend Pinia store

- [x] 12.1 Create `frontend/src/stores/activity.ts` with state `recent`, `mine`, `loadingRecent`, `loadingMine`, `error`, plus actions `loadRecent`, `loadMine`, `startGlobalPolling`, `stopGlobalPolling`, `reset`
- [x] 12.2 Implement `loadRecent` and `loadMine` calling the API client and setting the corresponding state slice; capture errors into `error`
- [x] 12.3 Implement `startGlobalPolling` — call `loadRecent()` immediately, store the timer id in a closure-private variable, set `setInterval(loadRecent, 30000)`; make it idempotent by short-circuiting if a timer is already active
- [x] 12.4 Implement `stopGlobalPolling` — `clearInterval(timer)` and null out the id; idempotent
- [x] 12.5 Implement `reset` — clear arrays, flags, error, AND call `stopGlobalPolling()` to ensure no leaked timer
- [x] 12.6 Wire `activityStore.reset()` into `frontend/src/stores/auth.ts` `logout()` alongside the existing resets (enrollments, submissions, reviews)

## 13. Frontend components

- [x] 13.1 Create `frontend/src/lib/activity-copy.ts` exporting an `eventCopy(event: ActivityEvent): { icon: string; html: string; challengeId: string | null }` helper (uses `pi pi-flag`, `pi pi-user-plus`, `pi pi-upload`, `pi pi-check-circle`, `pi pi-times-circle` per the design's D13)
- [x] 13.2 Create `frontend/src/components/ActivityTimeline.vue` with a `defineProps<{ events: ActivityEvent[] }>()` and a template that maps each event to a row with `Avatar` (initials fallback), the text from `eventCopy`, a `<router-link>` on the challenge title, and a `formatDistanceToNow` timestamp
- [x] 13.3 Render a plain-text "No activity yet" placeholder when `events.length === 0`
- [x] 13.4 Create `frontend/src/components/StatsTiles.vue` with `defineProps<{ stats: MyStats | null }>()` rendering three PrimeVue `Card`s with PrimeVue `Skeleton` placeholders when `stats` is null
- [x] 13.5 Visual check  *(requires running dev server — manual; covered by §17 browser verification)*: import both components into a temporary scratch view (or use Vue devtools) and confirm rendering before wiring into views

## 14. Frontend MeView wiring

- [x] 14.1 In `frontend/src/views/MeView.vue` import `useActivityStore`, `getMyStats`, `StatsTiles`, `ActivityTimeline`; add local `stats: Ref<MyStats | null>` and `activity = useActivityStore()`
- [x] 14.2 In `onMounted`: call `getMyStats().then(s => stats.value = s).catch(e => ...)` and `activity.loadMine()`
- [x] 14.3 Insert `<StatsTiles :stats="stats" />` between the profile header and the My Challenges table
- [x] 14.4 Insert `<ActivityTimeline :events="activity.mine" />` under a "Recent Activity" heading below the My Challenges table
- [x] 14.5 Verify the four-section vertical layout  *(requires running dev server — covered by §17 browser verification)* matches the modified `frontend-enrollments` spec; both empty-state scenarios render correctly

## 15. Frontend ChallengesView wiring (org-wide feed)

- [x] 15.1 In `frontend/src/views/ChallengesView.vue` import `useActivityStore`, `ActivityTimeline`; add `activity = useActivityStore()`
- [x] 15.2 In `onMounted` call `activity.startGlobalPolling()`; in `onUnmounted` call `activity.stopGlobalPolling()`
- [x] 15.3 Render an "Org-wide Activity" panel near the top of the page with `<ActivityTimeline :events="activity.recent" />`; keep the existing DataTable below it
- [x] 15.4 Verify in browser devtools  *(requires running dev server — covered by §17 browser verification)* (Network tab) that the request fires immediately on mount and again every ~30 s; verify it stops when navigating away

## 16. Frontend gates

- [x] 16.1 Run `yarn type-check` — clean
- [x] 16.2 Run `yarn build` — clean
- [x] 16.3 Run `yarn lint` (if configured) — clean  *(frontend has no lint script; `yarn build` runs `vue-tsc` which acts as the FE typing gate)*

## 17. Browser verification (interactive, leave unchecked until validated)

- [x] 17.1 Start the stack: `docker compose up -d`, `yarn migration:run` in `backend/`, `yarn start:dev` in `backend/`, `yarn dev` in `frontend/`
- [x] 17.2 Sign in with two `@vitalify.asia` accounts in two browsers — Account A (owner) and Account B (enrollee)
- [x] 17.3 Account A creates a challenge → confirm the home-page Org-wide Activity panel shows a "Created Learn X" row within 30 s in Account B's browser (verifying public feed + polling)
- [x] 17.4 Account B enrolls in the challenge → confirm a new `enrolled` row appears in the global feed and in Account B's `/me` Recent Activity
- [x] 17.5 Account B uploads a submission (PDF or external URL) → confirm a `submitted` row with the correct `kind` text appears in both feeds
- [x] 17.6 Account A approves → confirm an `approved` row recorded under Account B (the submitter) appears in Account B's `/me` Recent Activity AND in the global feed
- [x] 17.7 Repeat with a fresh enrollee (Account C) submitting and Account A rejecting with a reason → confirm a `rejected` row appears in both feeds
- [x] 17.8 Account B navigates to `/me` → confirm Stats Tiles show: Challenges Created = 0, In-Progress Enrollments = 0 (their enrollment is now `approved`), Approved Enrollments = 1
- [x] 17.9 Account A navigates to `/me` → confirm Stats Tiles show: Challenges Created = 1, In-Progress Enrollments = 0, Approved Enrollments = 0 (Account A never enrolled)
- [x] 17.10 Account A soft-deletes the challenge → confirm `/me` Stats Tiles now show Challenges Created = 0 for Account A; the global feed still shows the `challenge_created` event (history preserved per design D16)
- [x] 17.11 Open an Incognito window (no JWT) → load `/` → confirm the Org-wide Activity panel still renders (unauthenticated public access works)
- [x] 17.12 Inspect the database: `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "SELECT event_type, user_id, payload->>'challengeTitle' as title, created_at FROM activity_events ORDER BY created_at DESC LIMIT 10;"` — confirm rows align with the actions performed
