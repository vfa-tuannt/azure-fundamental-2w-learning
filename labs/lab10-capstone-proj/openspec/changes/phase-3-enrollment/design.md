## Context

Phase 2 delivered the `challenges` table, the public list/detail endpoints, and the owner-only CRUD mutations. It deliberately hard-coded `enrollmentsCount: 0` in `ChallengesService.toDto()` because there was no enrollment table to count against; the field is in the response contract, just not yet meaningful. Phase 3 introduces the `enrollments` table and rewires that single field to a real subquery, plus three new endpoints (`POST /challenges/:id/enroll`, `DELETE /challenges/:id/enroll`, `GET /me/enrollments`) and a helper (`GET /challenges/:id/enrollment`) that the detail page calls to know which button to render.

Constraints from the PRD (US-008, US-009):
- `enrollments` table schema is fixed: `id`, `challenge_id FK`, `user_id FK`, `status (enum: in_progress|submitted|approved|rejected)`, `enrolled_at`
- `POST /challenges/:id/enroll`: **409** for already-enrolled, **409** for max-reached, **400** for closed challenge
- `DELETE /challenges/:id/enroll`: only allowed when status is `in_progress`
- `GET /me/enrollments`: returns the caller's enrollments with challenge summary
- FE button states: `Enroll` / `Withdraw` / `Enrolled ✓` (disabled) for `submitted`/`approved`

Inherited platform constraints (CLAUDE.md):
- Service-layer ownership/business rules — controllers are one-line shims
- Global `ValidationPipe` already configured in Phase 2 — DTOs reuse it
- camelCase TypeScript ↔ snake_case columns via `@Column({ name: '...' })`
- Soft-delete model: `Challenge.deleted_at` exists; `Enrollment` does NOT soft-delete (PRD does not specify one)

## Goals / Non-Goals

**Goals:**
- An authenticated Vitalify member can enroll in any open challenge they don't own, and withdraw while their work is still in progress
- Already-enrolled / closed-challenge / cap-reached attempts return HTTP codes the frontend can branch on without parsing strings
- The challenge detail page shows the correct button state without a page reload, both right after enrolling and after a hard refresh
- `/me` shows every enrollment for the signed-in user, newest first, with enough context (challenge title, deadline, enrollment status) to act on
- `enrollmentsCount` on `GET /challenges` and `GET /challenges/:id` becomes a real number — the FE column `Enrolled/Max` finally tells the truth
- Owners cannot enroll in their own challenges (silently hide the button, but also enforce server-side with 400)

**Non-Goals:**
- No submission upload — that is Phase 4. We only model the `status` column with all four enum values so Phase 4 doesn't need a migration.
- No status transitions beyond `in_progress` ↔ (withdraw via DELETE) — `submitted`/`approved`/`rejected` are reserved here and set by later phases
- No notifications, no email, no activity events (Phase 6)
- No admin "see all enrollments for a challenge" endpoint — that is Phase 5 (review)
- No re-enrollment after withdraw within a cooldown / no enrollment history — the unique constraint is a hard barrier; if a user withdraws and changes their mind, they enroll again as a fresh row (the previous row was hard-deleted)
- No optimistic UI on `POST /me/enrollments` aggregation — the `/me` list re-fetches after enroll/withdraw rather than mutating in place
- No real-time updates — the detail page does not re-poll the enrollment count
- No partial unique that depends on status — the `(challenge_id, user_id)` unique is absolute; combined with hard-delete on withdraw it gives the same UX without the complexity of a partial index

## Decisions

**D1 — `enrollments` is a separate table with `(challenge_id, user_id)` unique constraint and FKs `ON DELETE RESTRICT`**
The shape mirrors PRD §8 verbatim. The unique constraint is enforced at the database level so a race between two concurrent `POST /challenges/:id/enroll` calls from the same user can never both succeed — the second hits a unique-violation that the service translates to 409. `ON DELETE RESTRICT` matches the choice we made for `challenges.owner_id → users.id` in Phase 2: we never want a user delete to silently cascade away enrollments or submissions.

Rationale: cheap, DB-enforced correctness; matches the existing pattern. Alternative (application-level uniqueness check + insert) leaves a race window.

**D2 — Withdraw is a hard delete of the enrollment row, not a status change**
The PRD says "enrolled user can withdraw if status is `in_progress`". Two implementations are possible: (a) set `status = 'withdrawn'` (introducing a fifth enum value), or (b) delete the row. We pick (b): the `(challenge_id, user_id)` unique constraint plus a clean row absence is the simplest possible representation of "the user is not enrolled anymore". A fifth enum value would force every other read path (`enrollments_count`, `/me/enrollments`, the FE button logic) to filter it out everywhere; deletion removes the row from all of those for free.

Re-enrollment after a withdraw is then just another `POST /challenges/:id/enroll` — the row's history (the original `enrolled_at`) is lost, which the PRD does not protect.

Rationale: simplest data model that satisfies the PRD. Alternative (status=withdrawn) doubles the conditional logic on every read.

**D3 — `enrollmentsCount` excludes `rejected` rows but includes `in_progress`, `submitted`, and `approved`**
"Enrollments count" for the FE `Enrolled/Max` column should reflect *people taking up a slot*. A rejected submission means the user's attempt is over and their slot frees up — otherwise a challenge with `max_enrollments: 3` could permanently fill up with three rejections and become unenrollable. Withdrawn users are already gone (hard delete, see D2), so they don't enter the count by construction.

`max_enrollments` is checked against the same count: `enroll` returns 409 when `non_rejected_count >= max_enrollments`. The Phase-2 `ChallengesService.toDto()` swap is therefore: `enrollmentsCount = SELECT COUNT(*) WHERE challenge_id = c.id AND status != 'rejected'`.

Rationale: matches user intuition about "open seats". Alternative (count all rows including rejected) makes max-enrollments behave surprisingly when reviews are strict.

**D4 — Owner cannot enroll in their own challenge (enforced server-side)**
The PRD does not say this explicitly, but it falls out of the domain: an owner creating a challenge is asking *others* to learn the skill. Letting the owner enroll lets them count toward their own `max_enrollments` cap, distort the "Enrolled" count, and submit work to themselves. We return HTTP 400 (`"You cannot enroll in your own challenge"`) on `POST /challenges/:id/enroll` when `req.user.id === challenge.ownerId`. The FE hides the button proactively.

Rationale: prevents nonsensical state without surprising anyone. Alternative (allow it) creates support tickets.

**D5 — `enrollmentsCount` is computed in the list query with a correlated subquery, not a JOIN/GROUP BY**
Postgres's planner handles `(SELECT COUNT(*) FROM enrollments WHERE challenge_id = c.id AND status != 'rejected')` as a correlated subquery efficiently when there is an index on `enrollments.challenge_id` (we add one as part of the FK). For the small N of an internal platform this is simpler than rewriting the existing `ChallengesService.findAll()` QueryBuilder to a `LEFT JOIN ... GROUP BY` (which would also force every other selected column to appear in `GROUP BY` or be wrapped in an aggregate — noise we don't want).

The detail endpoint uses the same subquery, run once.

Rationale: minimum change to existing Phase-2 query. Alternative (LEFT JOIN GROUP BY) is faster only at scales we won't hit and is much more code.

**D6 — `GET /challenges/:id/enrollment` returns the *caller's* enrollment, scoped to the JWT**
The detail page needs to render `Enroll` vs `Withdraw` vs `Enrolled (Submitted)`. It does NOT need other users' enrollments. We expose a small, JWT-protected endpoint that returns the caller's `Enrollment` for the path challenge, or 404 if they aren't enrolled. This is also what the `enrollmentsStore` caches keyed by `challengeId`.

Alternative: embed the caller's enrollment inside `GET /challenges/:id` when authenticated. We rejected this because `GET /challenges/:id` is public — having a field that appears only when a token is present makes the response shape conditional, which is hard to type and harder to test.

Rationale: keeps the public detail endpoint truly public and side-effect-free; a separate endpoint is cheap. Alternative (conditional embed) couples auth to a public read.

**D7 — `/me/enrollments` returns rows newest-first with an embedded `challenge` summary**
Shape: `{ id, status, enrolledAt, challenge: { id, title, deadline, status, requiredSkills } }`. The endpoint does a single JOIN with `challenges` (filtering `challenges.deleted_at IS NULL` so withdrawn-by-owner-delete rows disappear) and orders by `enrollments.enrolled_at DESC`. We do not paginate Phase 3 — a single Vitalify employee will not have hundreds of enrollments before Phase 4 ships. If we need to we can add `?page=&limit=` later without breaking the response (the shape will become `{ items, page, limit, total }` then).

Rationale: matches PRD US-009; trivial to render in a PrimeVue DataTable. Alternative (no embed, FE makes N+1 calls) is a performance and code smell.

**D8 — Pinia `enrollmentsStore` is a `Map<challengeId, Enrollment|null>` plus a `myList` array**
The detail page asks the store "what is the caller's enrollment for *this* challenge?" The `Map` answers in O(1); a miss triggers a fetch and caches the result (including the 404-as-null). Enroll/withdraw mutations update both the per-challenge map entry and the `myList` array (re-fetching the list is also acceptable but the optimistic path is simple enough). The challenge detail's `enrollmentsCount` chip is the value from `GET /challenges/:id` — we increment/decrement it locally on enroll/withdraw success.

Rationale: avoids re-fetching the entire detail or the list on every enroll click. Alternative (no store, just call the API in the component) is fine but duplicates the cache-miss logic.

**D9 — Service-layer transactional guard on `enroll`**
The race we care about: two members hit `POST /challenges/:id/enroll` simultaneously for a challenge with `max_enrollments: 1`. We use a single TypeORM transaction with `SERIALIZABLE` isolation around the (count → insert) sequence so the second commit fails and the service retries → re-reads → returns 409. The unique constraint on `(challenge_id, user_id)` is the second line of defense (it stops two requests from the *same* user).

Rationale: explicit correctness for a known race. Alternative (no transaction, rely on a `SELECT ... FOR UPDATE` row lock on `challenges`) works but is harder to reason about in TypeORM.

**D10 — `EnrollmentsModule` does NOT import `ChallengesModule`'s service directly — it injects the TypeORM repository**
We need to read the challenge row inside `EnrollmentsService.enroll()` to check `status`, `owner_id`, `max_enrollments`, and `deleted_at`. The cleanest dependency is to inject the `Repository<Challenge>` directly (re-exported from `ChallengesModule`) rather than to call `ChallengesService` methods, because (a) we need a single transactional context, and (b) `ChallengesService` exposes the user-facing CRUD surface — extending it with low-level read helpers would muddy its API.

Rationale: clear unidirectional dependency, no method-naming churn in `ChallengesService`. Alternative (call `ChallengesService.findOne`) is fine but couples the two service surfaces.

**D11 — FE button matrix**

| State | Button label | Disabled | Tooltip / hint |
|---|---|---|---|
| Owner of challenge | (hidden) | — | "You own this challenge" |
| No JWT (unauthenticated visitor) | "Sign in to enroll" | no — links to `/login` | — |
| Not enrolled, challenge `open`, seats left | "Enroll" | no | — |
| Not enrolled, challenge `open`, full | "Full" | yes | "This challenge has reached its enrollment cap" |
| Not enrolled, challenge `closed` | "Closed" | yes | "This challenge is no longer accepting enrollments" |
| Enrolled, status `in_progress` | "Withdraw" | no, confirm via ConfirmDialog | — |
| Enrolled, status `submitted` | "Enrolled (Submitted)" | yes | "Your submission is awaiting review" |
| Enrolled, status `approved` | "Enrolled (Approved)" | yes | "Your submission has been approved" |
| Enrolled, status `rejected` | "Enrolled (Rejected)" | yes | "Your submission was rejected" |

Rationale: every case has exactly one button so the user never has to guess. Alternative (auto-hide on terminal states) makes the page look broken.

## Risks / Trade-offs

- [Hard-delete on withdraw loses the audit trail] → Mitigation: this is by design (D2). When Phase 6 (activity feed) lands, the `enrollment.created` and `enrollment.withdrawn` events will be persisted in `activity_events`, which is the right place for history. The `enrollments` table is the *current state*, not the log.
- [Race on `max_enrollments` cap under high concurrency] → Mitigation: D9 (`SERIALIZABLE` transaction); the cap is for typical internal use (≤ a few people per challenge), not a flash sale.
- [`enrollmentsCount` subquery on every list row] → Mitigation: index on `enrollments(challenge_id)` (added by the FK) + small N. If the list query gets slow, denormalise into a `challenges.enrollments_count` column updated by triggers — but only when measured.
- [Owner-cannot-enroll rule is an unstated PRD assumption] → Mitigation: documented here and enforced server-side; the FE never shows the button so users never trip the 400.
- [`/me/enrollments` returns all rows without pagination] → Mitigation: capped by the user's enrollment count (≤ tens) for v1; switching to `{ items, page, limit, total }` later is non-breaking if we add it as a new field rather than reshape the array (we can also gate it behind a query param).
- [Phase-2 `enrollmentsCount: 0` is now dynamic — clients that asserted on `=== 0` will regress] → Mitigation: no such client exists; the FE table column already renders the value with no assumption about its magnitude.

## Migration Plan

1. Generate a TypeORM migration `CreateEnrollmentsTable` that:
   - creates the `enrollment_status` enum (`in_progress`, `submitted`, `approved`, `rejected`)
   - creates the `enrollments` table with columns from the proposal
   - adds FK `enrollments.challenge_id → challenges.id` (`ON DELETE RESTRICT`)
   - adds FK `enrollments.user_id → users.id` (`ON DELETE RESTRICT`)
   - adds unique constraint `(challenge_id, user_id)`
   - adds index on `(user_id, enrolled_at DESC)` for `GET /me/enrollments`
   - adds index on `(challenge_id)` (covered by the FK in Postgres, but make it explicit) for the `enrollmentsCount` subquery
2. **Review the generated SQL by hand** before commit: TypeORM tends to omit composite indexes ordered `DESC` and may emit a redundant index next to the FK — fix both manually (this is the same hand-edit step we did in Phase 2).
3. Run `yarn migration:run` against local Postgres; verify in pgAdmin (`\d enrollments`).
4. Deploy is local-only in Phase 3 — no Azure migration. The same migration will run unmodified on Azure Database for PostgreSQL Flexible Server in Phase 7.
5. **Rollback**: `yarn migration:revert` drops the table, the constraints, the indexes, and the enum type in reverse order. The generated `down()` must be inspected — TypeORM sometimes forgets to drop the enum type, which would cause re-running the migration to fail with `type already exists`. Add `DROP TYPE` to `down()` manually if missing.

## Open Questions

None. All PRD ambiguities are resolved in the Decisions section above:
- D2 picks hard-delete-on-withdraw
- D3 picks "exclude rejected" for the count
- D4 picks "owner cannot enroll"
- D6 picks a dedicated `GET /challenges/:id/enrollment` over a conditional embed

Phase 4 (submissions) will take over status transitions for `in_progress → submitted`; Phase 5 (review) takes `submitted → approved | rejected`. The enum values are reserved now so neither phase needs a migration.
