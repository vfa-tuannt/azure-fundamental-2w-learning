## Why

Phase 4 lets enrolled users upload submissions but the loop dead-ends there — once a submission lands, the enrollment sits at `status = submitted` forever and the challenge owner has no way to verify, accept, or reject the work. Phase 5 (PRD US-012, US-013) closes the loop: challenge owners can list the submissions on their challenge, approve them (flipping the enrollment to `approved`), or reject them with an optional reason (flipping the enrollment to `rejected`). This is the last persistence-layer feature before Phase 6's activity feed can show "approved" / "rejected" events.

## What Changes

- Add `POST /submissions/:id/approve` — challenge owner only; transitions the parent enrollment from `submitted` → `approved`; returns 200 with the updated submission DTO; 403 for non-owner; 409 if enrollment is not in `submitted` state.
- Add `POST /submissions/:id/reject` — challenge owner only; accepts optional `{ reason?: string }` body; transitions the parent enrollment from `submitted` → `rejected`; stores the reason on the submission row; returns 200 with the updated submission DTO; 403 for non-owner; 409 if enrollment is not in `submitted` state.
- Add `GET /challenges/:id/submissions` — challenge owner only; lists every submission for every enrollment on the challenge, with embedded submitter info `{ id, name, email, avatarUrl }` and enrollment status; ordered newest-first.
- Extend the `submissions` table with two nullable columns: `rejection_reason` (text) and `reviewed_at` (timestamptz). No backfill required — they remain null until a review action happens.
- Extend the `Submission` DTO to include `rejectionReason: string | null` and `reviewedAt: string | null` so the FE can render the rejection banner without an extra round-trip.
- Add a "Submissions" tab on the challenge detail view that is **only** rendered to the challenge owner. The tab shows a DataTable of every submission across every enrollment with submitter name + avatar, file/URL link, notes, submitted timestamp, current enrollment status, and per-row Approve (green) / Reject (red) action buttons (hidden for already-reviewed rows).
- Add a Reject dialog (PrimeVue `Dialog`) with an optional reason `Textarea`; submit triggers the reject action with optimistic UI updating the row's enrollment status and the rejection banner inline.
- Update the existing My Submissions list (FE) to render a rejection banner with the `rejectionReason` text when a submission has been rejected, so the enrollee learns why.

## Capabilities

### New Capabilities

- `backend-reviews`: the review endpoints (approve, reject, list-for-challenge), the owner-only authorization rule, the enrollment status transition (`submitted` → `approved | rejected`) under a row-level lock, and the DTO shape extension required for the FE to render submitter info.
- `frontend-reviews`: the owner-only Submissions tab on the challenge detail view, the per-row Approve/Reject controls, the Reject dialog with optional reason, optimistic UI on action success, error Toasts on 403/409/network failures, and the typed review API client + Pinia state that backs them.

### Modified Capabilities

- `backend-submissions`: extend the `submissions` table with `rejection_reason` and `reviewed_at` columns, and extend the Submission DTO shape with `rejectionReason` and `reviewedAt` fields. The Phase 4 endpoints (`POST /enrollments/:id/submissions`, `GET /enrollments/:id/submissions`, `GET /submissions/:id`) keep their existing behaviour — only their response payload grows by two fields.
- `frontend-submissions`: update the `Submission` TypeScript interface in `src/api/types.ts` to include the two new nullable fields, and update the My Submissions list to render a rejection banner when `rejectionReason` is non-null. The Submit Output panel and submissions store behaviour are unchanged.

## Impact

- **Backend code**:
  - New `backend/src/reviews/` module: `reviews.controller.ts`, `reviews.service.ts`, `reviews.module.ts`, `dtos/reject-submission.dto.ts`, plus unit + E2E tests.
  - `backend/src/submissions/submission.entity.ts` gains two nullable columns; `toDto()` mapper grows two fields.
  - `backend/src/submissions/submissions.service.ts` exposes a helper for fetching the full review context (`{ submission, enrollment, challenge }`) which the reviews service consumes.
  - New TypeORM migration adding the two columns to `submissions`.
  - `backend/src/app.module.ts` registers `ReviewsModule`.
- **Frontend code**:
  - New `frontend/src/api/reviews.ts` (typed client for approve, reject, list-challenge-submissions).
  - New `frontend/src/stores/reviews.ts` (cache keyed by `challengeId`, plus per-submission optimistic action wrappers).
  - `frontend/src/views/ChallengeDetailView.vue` gains a "Submissions" tab/section visible only when caller is the owner.
  - `frontend/src/api/types.ts` extends `Submission` with the new fields.
  - New shared `RejectDialog.vue` component (or inline `Dialog` in the view — design TBD).
- **Database**: one new migration adding two nullable columns to `submissions`. No data backfill. Down migration drops them.
- **Specs**: two new capability spec files (`backend-reviews`, `frontend-reviews`); two modified capability deltas (`backend-submissions`, `frontend-submissions`).
- **No new external dependencies** — uses existing NestJS, TypeORM, PrimeVue, Pinia stacks.
- **No FR changes** — Phase 5 implements FR-6 from the PRD (already listed; previously unimplemented).
