## 1. Backend dependencies and environment

- [x] 1.1 Verify no new runtime dependencies are needed (`class-validator`, `@nestjs/typeorm`, `pg`, `typeorm`, `@nestjs/common` already present); record findings in commit message
- [x] 1.2 Confirm `JwtAuthGuard` from Phase 1 is still the canonical guard used by the Submissions module; reuse it for `ReviewsController`
- [x] 1.3 Confirm `EnrollmentStatus` enum already exposes `approved` and `rejected` values (no enum changes needed in this phase)

## 2. Backend entity and migration

- [x] 2.1 Add `rejectionReason: string | null` field to `backend/src/submissions/submission.entity.ts` mapped via `@Column({ name: 'rejection_reason', type: 'text', nullable: true })`
- [x] 2.2 Add `reviewedAt: Date | null` field to the same entity mapped via `@Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })`
- [x] 2.3 Generate the migration with `yarn migration:generate -- ./src/migrations/AddReviewColumnsToSubmissions`
- [x] 2.4 Hand-review the generated SQL — ensure `ALTER TABLE submissions ADD COLUMN rejection_reason TEXT NULL, ADD COLUMN reviewed_at TIMESTAMPTZ NULL` and a clean reverse `DROP COLUMN` pair in `down()`
- [x] 2.5 Run `yarn migration:run` against the local Postgres; verify with `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "\d submissions"` that the new columns exist and are nullable
- [x] 2.6 Run `yarn migration:revert` then `yarn migration:run` once more to confirm the migration round-trips cleanly

## 3. Backend Reviews module — scaffolding

- [x] 3.1 Create `backend/src/reviews/reviews.module.ts` importing `TypeOrmModule.forFeature([Submission, Enrollment, Challenge, User])`, providing `ReviewsService`, and exporting `ReviewsService`
- [x] 3.2 Register `ReviewsModule` in `backend/src/app.module.ts`
- [x] 3.3 Create `backend/src/reviews/dto/reject-submission.dto.ts` with class `RejectSubmissionDto { @IsOptional() @IsString() @MaxLength(1000) reason?: string }`
- [x] 3.4 Create `backend/src/reviews/dto/challenge-submission.dto.ts` describing the embedded shape `{ ...SubmissionDto, enrollment: { id, userId, status }, submitter: { id, name, email, avatarUrl } }`
- [x] 3.5 Update existing `backend/src/submissions/dto/submission.dto.ts` to add `rejectionReason: string | null` and `reviewedAt: string | null` fields

## 4. Backend Reviews service — business logic

- [x] 4.1 Create `backend/src/reviews/reviews.service.ts` with constructor-injected `Repository<Submission>`, `Repository<Enrollment>`, `Repository<Challenge>`, `Repository<User>`, `DataSource`, and `SubmissionsService` (for `getSubmissionContext`)
- [x] 4.2 Implement `approve(submissionId: string, callerUserId: string): Promise<SubmissionDto>` — fetch submission context, assert caller is challenge owner (else `ForbiddenException`), open transaction with `SELECT ... FOR UPDATE` on the enrollment row, assert `enrollment.status === submitted` (else `ConflictException`), set `enrollment.status = approved` and `submission.reviewed_at = new Date()`, save both, return `submissionsService.toDto(updatedSubmission)`
- [x] 4.3 Implement `reject(submissionId: string, callerUserId: string, reason?: string): Promise<SubmissionDto>` — same shape as approve, with `enrollment.status = rejected`, `submission.reviewed_at = new Date()`, and `submission.rejection_reason = (reason?.trim() || null)` so empty/whitespace-only reasons normalize to NULL
- [x] 4.4 Implement `listForChallenge(challengeId: string, callerUserId: string): Promise<ChallengeSubmissionDto[]>` — fetch challenge (404 if missing/soft-deleted), assert caller is owner (else `ForbiddenException`), `LEFT JOIN` query returning `submissions` ↔ `enrollments` ↔ `users` rows ordered by `submitted_at DESC`, mapped to `ChallengeSubmissionDto`
- [x] 4.5 Expose a helper `toChallengeSubmissionDto(submission, enrollment, submitter): ChallengeSubmissionDto` mapping camelCase ↔ snake_case
- [x] 4.6 Ensure all errors raised throw the correct NestJS exception class (`NotFoundException`, `ForbiddenException`, `ConflictException`) so the global filter returns the right HTTP status
- [x] 4.7 Make `SubmissionsService.toDto` accessible (already public; verify) so `ReviewsService` reuses it instead of duplicating mapping logic

## 5. Backend Reviews controller

- [x] 5.1 Create `backend/src/reviews/reviews.controller.ts` with `@UseGuards(JwtAuthGuard)` and three routes
- [x] 5.2 `@Post('submissions/:id/approve')` — wires to `reviewsService.approve(req.user.id, params.id)`; explicit `@HttpCode(200)` (default for POST is 201, we want 200 because the resource is updated not created)
- [x] 5.3 `@Post('submissions/:id/reject')` — accepts `@Body() body: RejectSubmissionDto`, wires to `reviewsService.reject(req.user.id, params.id, body.reason)`; `@HttpCode(200)`
- [x] 5.4 `@Get('challenges/:id/submissions')` — wires to `reviewsService.listForChallenge(req.user.id, params.id)`
- [x] 5.5 Register the controller in `ReviewsModule.controllers`
- [x] 5.6 Verify route registration via `yarn start:dev` boot logs — three new routes should appear

## 6. Backend Submissions service — update DTO mapper

- [x] 6.1 Update `SubmissionsService.toDto()` to include the new `rejectionReason` and `reviewedAt` fields (ISO 8601 string conversion for `reviewedAt` when non-null, `null` passthrough otherwise)
- [x] 6.2 Verify unit tests for `SubmissionsService` still pass after the DTO shape change (expectations may need updating to add the two new fields with `null` default)

## 7. Backend tests

- [x] 7.1 Add unit tests for `ReviewsService.approve` covering: success path, non-owner caller (403), submission not found (404), enrollment status not `submitted` (409 — try each of `in_progress`, `approved`, `rejected`), database failure leaves status unchanged
- [x] 7.2 Add unit tests for `ReviewsService.reject` covering: success with reason, success with empty reason (stored as NULL), success with whitespace-only reason (NULL), non-owner caller (403), 404, 409 (each invalid prior status)
- [x] 7.3 Add unit tests for `ReviewsService.listForChallenge` covering: success returning ordered + embedded data, non-owner caller (403), challenge not found (404), soft-deleted challenge (404), empty list
- [x] 7.4 Add E2E tests for `POST /submissions/:id/approve` covering all status codes (200, 401, 403, 404, 409)
- [x] 7.5 Add E2E tests for `POST /submissions/:id/reject` covering all status codes plus validation 400 (reason > 1000 chars, reason not a string)
- [x] 7.6 Add E2E tests for `GET /challenges/:id/submissions` covering 200 with embedded shape, 401, 403, 404
- [x] 7.7 Update existing Phase 4 unit tests for `SubmissionsService` that snapshot the DTO — add `rejectionReason: null` and `reviewedAt: null` to expected shapes
- [x] 7.8 Update existing Phase 4 E2E tests that assert response shapes for `POST /enrollments/:id/submissions`, `GET /enrollments/:id/submissions`, `GET /submissions/:id` — add the two new fields to expected JSON

## 8. Backend gates

- [x] 8.1 Run `yarn lint` — must be clean
- [x] 8.2 Run `yarn test` — all tests pass
- [x] 8.3 Run `yarn tsc --noEmit` — no TS errors

## 9. Frontend types

- [x] 9.1 Extend the `Submission` interface in `frontend/src/api/types.ts` with `rejectionReason: string | null` and `reviewedAt: string | null`
- [x] 9.2 Add a new `ChallengeSubmission` interface in the same file extending `Submission` with `enrollment: { id: string; userId: string; status: EnrollmentStatus }` and `submitter: { id: string; name: string; email: string; avatarUrl: string | null }`
- [x] 9.3 Run `yarn type-check` after this step to catch any consumer of `Submission` that needs the new fields populated

## 10. Frontend API client

- [x] 10.1 Create `frontend/src/api/reviews.ts` exporting three functions: `listForChallenge`, `approve`, `reject`
- [x] 10.2 `listForChallenge(challengeId)` → `GET /challenges/:id/submissions`, returns `Promise<ChallengeSubmission[]>`
- [x] 10.3 `approve(submissionId)` → `POST /submissions/:id/approve` with no body, returns `Promise<Submission>`
- [x] 10.4 `reject(submissionId, reason?)` → `POST /submissions/:id/reject` with body `reason !== undefined ? { reason } : {}`, returns `Promise<Submission>`
- [x] 10.5 Use the shared `api` axios instance from `@/api/axios` so the JWT is attached automatically

## 11. Frontend Pinia store

- [x] 11.1 Create `frontend/src/stores/reviews.ts` with state `byChallengeId: Map<string, ChallengeSubmission[]>`, `loading: boolean`, `error: string | null`
- [x] 11.2 Implement `loadForChallenge(challengeId)` calling the API client and setting the map entry
- [x] 11.3 Implement `approve(challengeId, submissionId)` with optimistic update — capture pre-action snapshot of the row, immediately mutate `enrollment.status` to `'approved'` and `reviewedAt` to a placeholder `new Date().toISOString()`, then call the API; on success replace optimistic values with server response; on error restore the snapshot and set `error`
- [x] 11.4 Implement `reject(challengeId, submissionId, reason?)` with the same optimistic pattern — set `enrollment.status` to `'rejected'`, `reviewedAt` to placeholder, `rejectionReason` to `(reason?.trim() || null)`
- [x] 11.5 Implement `reset()` clearing all state
- [x] 11.6 Wire `reviewsStore.reset()` into `frontend/src/stores/auth.ts` `logout()` alongside the existing enrollments + submissions resets

## 12. Frontend ChallengeDetailView — owner Submissions panel

- [x] 12.1 Add a computed `isOwner` to the view (or reuse the existing one) — `auth.user?.id === challenge.value?.ownerId`
- [x] 12.2 On mount (and in the existing `load()`), when `isOwner` is true, call `reviewsStore.loadForChallenge(challengeId)`
- [x] 12.3 Add an owner-only `<section v-if="isOwner">` rendering a PrimeVue `DataTable` of `reviewsStore.byChallengeId.get(challengeId)`
- [x] 12.4 Define columns: Submitter (`<Avatar>` + name), Submission (file link or external URL link parsed from `blobUrl` / `externalUrl`), Notes, Submitted (relative timestamp), Status (PrimeVue `Tag` color-mapped per status), Actions
- [x] 12.5 In the Status column map enrollment status → severity: `submitted → info`, `approved → success`, `rejected → danger`
- [x] 12.6 In the Actions column render Approve and Reject buttons **only** when `row.enrollment.status === 'submitted'`; otherwise render a small "Reviewed" tag or leave empty
- [x] 12.7 Render an "No submissions yet" placeholder when the array is empty (instead of an empty DataTable)
- [x] 12.8 Wire Approve button → `reviewsStore.approve(challengeId, row.id)` directly (one-click, no confirm)
- [x] 12.9 Implement inline Reject expansion using PrimeVue `DataTable`'s `expandedRows` model: a small icon button toggles the reject row open; the expanded row contains a `Textarea` for the reason and Confirm / Cancel buttons
- [x] 12.10 Wire Reject Confirm → `reviewsStore.reject(challengeId, row.id, reasonText)` then close the expansion on success
- [x] 12.11 Wire Reject Cancel → close expansion and clear textarea
- [x] 12.12 Reuse the existing `toast` (`useToast()`) to show success Toasts on resolved approve/reject and error/warning Toasts on rejection by the server (403, 409, 5xx)
- [x] 12.13 On HTTP 409, additionally call `reviewsStore.loadForChallenge(challengeId)` to reconcile the FE with server state and show a warning Toast

## 13. Frontend ChallengeDetailView — My Submissions rejection banner

- [x] 13.1 In the existing My Submissions list block, detect when a submission has been reviewed (`reviewedAt !== null`) and the enrollment status is `rejected`
- [x] 13.2 Render a PrimeVue `Message` (or styled callout) with `severity="error"` displaying the `rejectionReason` text if non-null
- [x] 13.3 When `rejectionReason` is null but the submission was rejected, show a fallback message "Submission rejected — no reason provided"
- [x] 13.4 Do NOT render the banner for approved submissions or for unreviewed (still `submitted`) submissions

## 14. Frontend gates

- [x] 14.1 Run `yarn type-check` — clean
- [x] 14.2 Run `yarn build` — clean
- [x] 14.3 Run `yarn lint` (if configured) — clean

## 15. Browser verification (interactive, leave unchecked until validated)

- [x] 15.1 Start the stack: `docker compose up -d`, `yarn migration:run` in `backend/`, `yarn start:dev` in `backend/`, `yarn dev` in `frontend/`
- [x] 15.2 Sign in with two `@vitalify.asia` accounts in two browsers — Account A (owner) and Account B (enrollee)
- [x] 15.3 Account A creates a challenge with `max_enrollments: 2`
- [x] 15.4 Account B enrolls and submits a small valid PDF
- [x] 15.5 Account A loads `/challenges/:id` — confirm the Submissions panel appears with one row in `submitted` status and Approve / Reject buttons visible
- [x] 15.6 Account A clicks Approve — confirm the row's status flips to `approved`, the action buttons disappear, a success Toast shows, and reloading the page persists the change
- [x] 15.7 Open a third browser (Account C), enroll, submit a small valid PNG
- [x] 15.8 Account A clicks Reject on Account C's row, enters reason "Image is blurry", confirms — verify status flips to `rejected` and Account C's `/me` and `/challenges/:id` views show the rejection banner with the reason text
- [x] 15.9 Verify a non-owner who navigates to `/challenges/:id` does NOT see the Submissions panel
- [x] 15.10 In Account A's browser, open two tabs of `/challenges/:id`; in tab 1 approve Account B's submission; in tab 2 (stale) click Approve again on the same row — verify a 409 warning Toast appears and the list reconciles
- [x] 15.11 Verify `/me` for Account B shows the `Approved` status badge on the relevant enrollment; Account C shows `Rejected`
- [x] 15.12 Inspect the database: `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "SELECT id, rejection_reason, reviewed_at FROM submissions ORDER BY submitted_at DESC LIMIT 5;"` — confirm reviewed rows have non-null `reviewed_at`, the rejected row has the reason stored, and the approved row has `rejection_reason = NULL`
