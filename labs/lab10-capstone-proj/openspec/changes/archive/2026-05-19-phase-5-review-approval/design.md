## Context

Phase 4 left the system with a one-way valve: enrolled users can ship work, but the challenge owner has no controlled way to accept or refuse it. Phase 5 (PRD US-012, US-013) closes that loop with two write endpoints (`approve`, `reject`) and one read endpoint (`GET /challenges/:id/submissions`), plus an owner-only Submissions tab on the challenge detail page.

Current state at the start of this change:

- `submissions` table has `id, enrollment_id, blob_url, external_url, notes, submitted_at` and a CHECK constraint enforcing XOR on the two URLs. No review metadata yet.
- `Submission` entity → `SubmissionDto { id, enrollmentId, blobUrl, externalUrl, notes, submittedAt }`.
- `EnrollmentStatus` enum already includes `approved` and `rejected` — only the transitions need to be wired.
- `SubmissionsService.getSubmissionContext(id)` already exists and was deliberately exposed in Phase 4 for exactly this consumer. It returns `{ submission, enrollment, challenge }` — a one-stop authorization context.
- FE Phase 4 button matrix on `ChallengeDetailView.vue` already renders the right state for `submitted/approved/rejected` (terminal disabled button); we just need to make sure those states actually get reached after an action.

Constraints:

- Authorization rule is uniform across the three new endpoints: caller must be the challenge owner (`challenge.owner_id == JWT.sub`). The enrollee gets nothing new from Phase 5 endpoints — they only see review outcomes via their existing `GET /submissions/:id`.
- Status transition must be safe against concurrent withdraw, concurrent submit, and concurrent approve/reject (e.g., two owner browser tabs). The Phase 4 design already uses a pessimistic write lock — we reuse that pattern.
- We must NOT break the Phase 4 invariant that `submissions` rows are immutable once written EXCEPT for the new review columns. The XOR CHECK constraint, `enrollment_id`, `blob_url`, `external_url`, `notes`, `submitted_at` columns are off-limits.

## Goals / Non-Goals

**Goals:**

- Challenge owners can list all submissions across their challenge in one call, with enough context (submitter identity, enrollment status) to act.
- Owners can approve or reject a submission with a single request; the side-effect on the enrollment is atomic with the side-effect on the submission row.
- Rejection captures an optional human-readable reason that the enrollee can see on their own My Submissions view (closing the feedback loop).
- The review action is idempotent in the sense that re-approving an already-approved row returns a clear 409 — it is NOT silently a no-op (we want to surface stale UI state).
- FE renders Approve/Reject controls only when both `enrollment.status == submitted` and the caller is the challenge owner; otherwise the row shows a status badge only.
- The FE never reloads the page after an action — Pinia state is updated optimistically and reconciled with the server response.

**Non-Goals:**

- No resubmission flow. Once an enrollment is `approved` or `rejected`, it is terminal. Re-opening a rejected enrollment is a future feature.
- No bulk approve / reject (single-row actions only).
- No audit trail beyond `reviewed_at` + `rejection_reason` on the submission row — we explicitly do NOT add a separate `reviews` history table (Phase 6's `activity_events` will record one event per action, which is the audit trail).
- No "who reviewed it" column. The challenge has a single owner, so `submission → enrollment → challenge → owner_id` is the answer; storing it again on the submission is redundant.
- No background processing — approval/rejection is fully synchronous in-request.
- No email notification to enrollee on review outcome (PRD §6 explicitly excludes notifications).
- No edit-the-reason workflow — once a submission is rejected, the reason is frozen. Owners who mis-rejected have to live with it (or we can add an "undo" later if needed).

## Decisions

### D1: Two endpoints (`approve`, `reject`) instead of one PATCH

**Decision:** Two separate `POST /submissions/:id/approve` and `POST /submissions/:id/reject` endpoints rather than a single `PATCH /submissions/:id { decision: 'approved'|'rejected', reason?: string }`.

**Why:**
- Matches the PRD exactly (US-012 says `POST /submissions/:id/approve` and `POST /submissions/:id/reject`).
- The two actions have different bodies (approve takes no body; reject takes an optional reason) — modelling them as a single PATCH means leaky validation (the FE has to remember "reason only matters if decision==rejected").
- Easier rate limiting and observability per action.

**Alternatives considered:**
- `PATCH /submissions/:id` with `{ decision, reason }` — rejected for the reasons above.
- `POST /submissions/:id/review` with `{ decision, reason }` — slightly better than PATCH but still less explicit than two named endpoints.

### D2: Persistence — add columns to `submissions` rather than a new `reviews` table

**Decision:** Add `rejection_reason TEXT NULL` and `reviewed_at TIMESTAMPTZ NULL` to the existing `submissions` table.

**Why:**
- 1:1 ratio: an enrollment has at most one submission (Phase 4 status guards), and a submission has at most one review (this phase enforces it). A separate `reviews` table would always be 1:1 with `submissions` — pure over-normalization.
- Querying the FE's Submissions tab in one shot is simpler — no extra join.
- Drop columns in `down()` migration is straightforward.

**Alternatives considered:**
- Separate `submission_reviews` table with `submission_id`, `decision`, `reason`, `reviewed_at`, `reviewed_by` — rejected because (a) it doesn't add data we need, (b) `reviewed_by` is derivable from the challenge owner, (c) it makes the simple case more complex.
- Store review on `enrollments` table (since `enrollment.status` already records the outcome) — rejected because rejection reason is about the *submission* artifact, not about the enrollment as a whole; also keeps the symmetric reads cleaner (one row = one submission + its review).

### D3: Status transition contract — only `submitted` → `approved | rejected`

**Decision:** The approve and reject endpoints accept the action ONLY when the parent enrollment's current `status` is `submitted`. Any other state (`in_progress`, `approved`, `rejected`) returns HTTP 409.

**Why:**
- Prevents accidental double-approve or approve-after-reject.
- Catches stale FE state (e.g., a second browser tab where the owner already approved) — the user gets a clear error instead of silent success.
- Symmetric: `in_progress` rejection makes no sense (no work has been submitted yet), `approved → rejected` would corrupt the audit narrative.

**Alternatives considered:**
- Allow `approved ↔ rejected` flips with no resubmission needed — rejected; the PRD doesn't ask for it and it adds correctness risk.
- Allow approve/reject on `in_progress` (auto-skipping submitted) — clearly wrong; nothing to review yet.

### D4: Locking — pessimistic write lock on `enrollments`, not on `submissions`

**Decision:** Inside the review transaction, acquire `SELECT ... FOR UPDATE` on the `enrollments` row (not the `submissions` row). Then read the submission, write both rows, commit.

**Why:**
- The Phase 4 `submit` path also locks the `enrollments` row — locking the same row in both places keeps all serialization on a single contention point.
- The submission's mutable fields (`rejection_reason`, `reviewed_at`) are guarded by the enrollment status check; we don't need an independent lock on the submission row.
- Avoids two-resource locking with potential ordering deadlocks.

**Alternatives considered:**
- Lock both rows: unnecessary; the enrollment row guards correctness already.
- Optimistic concurrency with a version column: pragmatically heavier than needed for ≤ low-hundreds requests/min.

### D5: List endpoint shape — embed submitter user info + enrollment status

**Decision:** `GET /challenges/:id/submissions` returns

```ts
type ChallengeSubmissionListItem = Submission & {
  enrollment: { id: string; userId: string; status: EnrollmentStatus };
  submitter: { id: string; name: string; email: string; avatarUrl: string | null };
};
```

ordered by `submittedAt DESC`.

**Why:**
- FE needs submitter name + avatar inline (PRD US-013 mentions "submitter name") — embedding avoids N+1 round-trips.
- Enrollment status is critical for action visibility — the FE hides Approve/Reject for non-`submitted` rows.
- Single round-trip on tab open.

**Alternatives considered:**
- Return only `Submission[]` and have the FE call `GET /users/:id` per row — rejected as needless chatter.
- Use `?expand=submitter,enrollment` query param like JSON:API — over-engineering for one endpoint.

### D6: Rejection reason — optional string, NULL when approved or unreviewed

**Decision:** `rejection_reason` is `TEXT NULL`. It is set ONLY by the reject endpoint, and only when the body includes a non-empty `reason` string. On approve, it remains `NULL`. On reject without a reason, it is `NULL`.

**Why:**
- Simplest schema. No constraint needed (because we control the writes).
- `reviewed_at` carries the "is this submission reviewed" signal; `rejection_reason` is supplemental.

**Trade-off:** A future "show me all rejections with a reason" query needs `WHERE rejection_reason IS NOT NULL` — fine, no extra index needed at this volume.

### D7: Reject body shape — `{ reason?: string }`, max 1000 chars

**Decision:** Reject body is `{ reason?: string }` where `reason` is optional. When provided, it must be a non-empty string ≤ 1000 chars (`@MaxLength(1000)` on the DTO). Empty string or whitespace-only is treated as "no reason" and stored as `NULL`.

**Why:**
- Bound the storage (no 1 MB rejection essays).
- Tolerate the FE submitting `{ reason: '' }` for the empty-textarea case — normalize to NULL on the server.

### D8: Frontend — extend the existing submissions store with read-only review derivations; introduce a separate reviews store for write actions and the challenge-wide list

**Decision:**
- A new `frontend/src/stores/reviews.ts` Pinia store owns the challenge-wide submission list (`byChallengeId: Map<string, ChallengeSubmission[]>`) and the approve/reject actions.
- The existing `submissions` store stays unchanged — it continues to own `byEnrollmentId` for the enrollee's My Submissions view.
- The `Submission` interface in `src/api/types.ts` grows two new optional fields (`rejectionReason: string | null`, `reviewedAt: string | null`); both stores benefit because both deserialize the same DTO shape.

**Why:**
- Two distinct read views (enrollee's per-enrollment list vs owner's per-challenge list) live in separate caches — no awkward "is this list the owner's view or the enrollee's view" question.
- Cross-store updates (a successful approve via the reviews store should also update the enrollments store's `myList` if the enrollee happens to be browsing — out of scope) stay clean.

**Alternatives considered:**
- One mega-store: rejected; the two views have different keys, different lifecycles, and different shapes.

### D9: Frontend — owner-only "Submissions" panel on the existing ChallengeDetailView, NOT a new route

**Decision:** Render the owner's Submissions list as an additional panel inside `ChallengeDetailView.vue`, gated on `isOwner === true`. No new route, no new page.

**Why:**
- Mirrors how the Phase 4 "Submit Output" panel is gated on `isEnrolled && status === in_progress` — the owner-only panel is the symmetric piece.
- Lower navigation overhead — the owner is already on the challenge detail; a separate `/challenges/:id/submissions` route would force a click.
- No URL needed to be sharable for v1.

**Alternatives considered:**
- Separate route `/challenges/:id/submissions` with a "Back to Challenge" link — over-engineering at this scale.
- PrimeVue `TabView` with "Overview" / "Submissions" tabs — possible nice future polish, but adds visual complexity; defer.

### D10: Reject UX — inline expandable row, NOT a modal

**Decision:** Clicking the Reject button on a row reveals an inline reason `Textarea` + Confirm/Cancel buttons within that row (expandable section). Confirm sends the request; Cancel collapses the expansion. NO modal dialog.

**Why:**
- Faster UX — the owner doesn't lose context (other rows stay visible).
- Modal pile-up risk: the page already uses ConfirmDialog for withdraw and other actions; adding a per-row modal here is heavier than needed.
- Easier accessibility — focus stays in-row.

**Alternatives considered:**
- PrimeVue `Dialog` with reason textarea — heavier; deferred until UX feedback says inline is too cramped.
- Single global "Reject" dialog with the row id passed in — same problem as above plus extra state plumbing.

### D11: Optimistic UI on approve / reject, with automatic rollback on error

**Decision:** When the owner clicks Approve (or Reject Confirm), the FE immediately updates the row's enrollment.status in the reviews store before the network request resolves. On HTTP success, the server's response replaces the optimistic value (canonical). On HTTP error, the FE rolls back the optimistic write and shows a Toast.

**Why:**
- Snappier perceived performance.
- Matches Phase 4's own optimistic pattern (the enrollment store optimistically flips `status` on enroll/withdraw).

**Trade-off:** Slightly more code than fire-and-forget. Mitigated by keeping the rollback path in one place inside the store action.

### D12: List endpoint exclusion rules

**Decision:** `GET /challenges/:id/submissions` returns ALL submissions for the challenge regardless of enrollment status — including those whose parent enrollment is currently `in_progress` (none — submissions always live alongside `submitted` or later), `submitted`, `approved`, or `rejected`. We do NOT exclude any rows.

**Why:**
- The owner is doing a review pass; they want to see what's there.
- The action buttons handle the "is this actionable" question per row.

**Alternative considered:** Filter to only `submitted` rows by default with a `?status=` query param — rejected; the owner cares about the full history.

## Risks / Trade-offs

- **[Risk]** Two concurrent owner browser tabs both approve the same submission → second request gets HTTP 409 → owner sees a confusing "already approved" Toast.
  → **Mitigation:** Toast message reads "This submission has already been reviewed — refreshing your view" with an explicit Refresh button. FE auto-refreshes the row on 409.
- **[Risk]** Owner approves a submission, then the enrollee tries to submit again (shouldn't be possible — `submitted` status blocks it, but Phase 4 spec scenario "Concurrent withdraw during submit" reminds us race windows exist).
  → **Mitigation:** Already covered by Phase 4's pessimistic lock on the enrollment row. Phase 5 reuses the same lock pattern.
- **[Risk]** Rejection reason might leak sensitive info (e.g., "you fail because XYZ is in our internal-only doc") — rendered to the enrollee verbatim.
  → **Mitigation:** Out of scope to filter content; owners must self-moderate. We do enforce `@MaxLength(1000)`.
- **[Risk]** Owner cannot un-approve / un-reject — a misclick is permanent.
  → **Mitigation:** Inline expansion + confirm on reject (no one-click drop). Approve is one-click but reversible UX (an "undo" feature) is deferred to a future change. The ConfirmDialog on Approve adds friction we don't want today.
- **[Trade-off]** Embedding submitter info in the list response means a JOIN against `users` on every page load. With ≤ low-hundreds submissions per challenge, this is negligible. If a future challenge ever scales to thousands, we add pagination there — not in this phase.
- **[Trade-off]** `rejected` enrollments stuck forever — fine for v1; a future "resubmit" or "reopen" change can lift this without DB schema changes (the columns already exist).

## Migration Plan

1. Generate migration with `yarn migration:generate -- ./src/migrations/AddReviewColumnsToSubmissions`. The generator should produce `ALTER TABLE submissions ADD COLUMN rejection_reason TEXT, ADD COLUMN reviewed_at TIMESTAMPTZ` and a clean `down()`. Hand-verify both `up()` and `down()`.
2. Apply locally with `yarn migration:run`; verify with `\d submissions` in psql.
3. Existing rows have `rejection_reason = NULL` and `reviewed_at = NULL` — no data backfill needed (consistent with "unreviewed" state).
4. No downtime concern locally; Azure deployment happens in Phase 7, so this is a single-developer rollout.
5. Rollback: `yarn migration:revert` runs `down()`, dropping both columns. Since these are net-new and no production data depends on them yet, rollback is clean.

## Open Questions

None at the time of writing. All decisions above are committed.
