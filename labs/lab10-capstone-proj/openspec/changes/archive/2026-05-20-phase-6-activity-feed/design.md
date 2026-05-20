## Context

Phases 0–5 have shipped the core create-enroll-submit-review loop. Today, after taking an action, a user sees the immediate effect (the new row, the status badge change, a Toast) but has no way to see what happened to other people, what they themselves did last week, or how much they've contributed overall. The `/me` page is a thin enrolled-challenges table; there is no "what's happening" view anywhere on the site.

Phase 6 is the last phase before Azure migration (Phase 7), and the PRD US-022 explicitly calls out that `activity_events` will move from Postgres to Cosmos DB during Phase 7c. That migration goal shapes our boundary: the FE must not know whether activity is persisted in Postgres or Cosmos, and the BE service interface must be swappable without controllers or DTOs changing. The PRD also specifies that `GET /activity/recent` is **public** — anyone on the LAN (or, post-Azure, anyone with the URL) can see the org's last 50 events. We treat this as a feature, not an oversight, and design DTOs accordingly (no email leaks for users in feed entries).

Existing relevant code:

- `backend/src/challenges/challenges.service.ts` — `create()` is the call-site that needs to emit `challenge_created`.
- `backend/src/enrollments/enrollments.service.ts` — `enroll()` is the call-site for `enrolled`.
- `backend/src/submissions/submissions.service.ts` — `createFileSubmission()` and `createUrlSubmission()` are the call-sites for `submitted`.
- `backend/src/reviews/reviews.service.ts` — `approve()` and `reject()` are the call-sites for `approved` / `rejected`.
- `backend/src/me/me.controller.ts` — already exists with `GET /me/enrollments`; we extend it with `GET /me/stats` rather than introduce a new module.
- `frontend/src/views/MeView.vue` — currently renders the profile header + My Challenges table; gets the stats card and Recent Activity panel.
- `frontend/src/views/ChallengesView.vue` — index route `/`; gets the org-wide activity panel above (or beside) the existing DataTable. Picking the home route here keeps the global feed in a place every authenticated user lands.

## Goals / Non-Goals

**Goals:**
- Record every create-enroll-submit-review action as an immutable `activity_events` row.
- Expose `GET /activity/recent` (public, last 50 events globally) and `GET /activity/me` (auth, last 50 events for the caller).
- Expose `GET /me/stats` returning `{ challengesCreated, enrollmentsActive, enrollmentsApproved }`.
- Render a stats card + a "Recent Activity" panel on `/me`, and an "Org-wide Activity" panel on the home page (`ChallengesView`) that auto-refreshes every 30 s.
- Keep the persistence layer behind a swappable interface so Phase 7c can replace Postgres with Cosmos DB without touching the FE or any controllers / DTOs.
- Ensure activity recording cannot break a user-facing action — recording failures are logged at `error` level but never roll back the originating transaction.

**Non-Goals:**
- No real-time push (no WebSockets / SSE) — polling at 30 s is the explicit requirement.
- No moderation, deletion, or editing of activity events.
- No "withdrawn" event type — the PRD US-014 enum is closed (5 types) and the withdraw action does not surface in the feed.
- No event-type filtering on the FE in this phase (timeline shows everything from the endpoint; we can add filters later).
- No pagination beyond "last 50" — we return a fixed page and the FE simply renders it.
- No FE state hydration from a websocket or server-sent events; the 30 s polling is the single source of truth for freshness.
- No Cosmos DB integration in this phase — that is explicitly Phase 7c.

## Decisions

### D1. Persistence: a single `activity_events` table with a JSONB payload, not five typed tables

Use one wide table with `event_type` as a discriminator and `payload jsonb` for type-specific data. Index on `(created_at DESC)` for the global feed and `(user_id, created_at DESC)` for `/activity/me`. Rationale: the read pattern is "last 50 globally" or "last 50 for one user" — both are trivially served from these two indexes. Cosmos DB will use the same one-document-per-event model (PRD US-022 names the container `activity_events` partitioned by `/userId`), so a one-table-here strategy maps cleanly. Alternatives considered: (a) five typed tables — rejected, multiplies migration work and forces UNION queries for the global feed; (b) ULID-based id with embedded timestamp for cheaper sorting — overkill at 50-row queries; we use the existing uuid PK pattern.

### D2. Event types: closed enum, 5 values, no extensions in this phase

The Postgres enum `activity_event_type` has exactly the 5 values from PRD US-014: `challenge_created`, `enrolled`, `submitted`, `approved`, `rejected`. No `withdrawn`, no `closed`, no `edited`, no `deleted`. Rationale: matches the PRD precisely; broadening the enum risks turning the feed into noise. If new event types are needed later, that is a follow-up change with its own enum-extension migration. Alternatives considered: store `event_type` as plain text — rejected, loses the cheap CHECK constraint and risks typos.

### D3. Payload shape: minimal but sufficient to render the FE row without extra fetches

Each event's `payload` JSONB stores **only the fields the FE timeline needs** plus the IDs to link back. Specifically:

| event_type          | payload fields                                                                                       |
|---------------------|------------------------------------------------------------------------------------------------------|
| `challenge_created` | `{ challengeId, challengeTitle }`                                                                    |
| `enrolled`          | `{ challengeId, challengeTitle, enrollmentId }`                                                      |
| `submitted`         | `{ submissionId, enrollmentId, challengeId, challengeTitle, kind: 'file' \| 'url' }`                  |
| `approved`          | `{ submissionId, enrollmentId, challengeId, challengeTitle, reviewerId }`                            |
| `rejected`          | `{ submissionId, enrollmentId, challengeId, challengeTitle, reviewerId, rejectionReason: string\|null }` |

The DTO emitted to the FE additionally embeds the actor — `user: { id, name, avatarUrl }`. We deliberately omit `email` from feed entries because `/activity/recent` is public; the PRD does not require it for rendering. Rationale: avoids the FE having to issue N+1 fetches per timeline item and avoids leaking emails to unauthenticated viewers. Alternatives considered: (a) store nothing in payload, look everything up at read time — adds joins, fragile against soft-deleted challenges; (b) duplicate the entire challenge record into payload — over-fetches; we keep just title (the only field shown in the feed line) plus IDs.

### D4. Event recording is fire-and-forget, **outside** the originating transaction

The activity write happens in `ActivityService.record(...)` **after** the originating service's transaction commits. If the activity insert fails, the error is logged at `error` level with the originating user/action context and swallowed — the user-facing action remains successful. Rationale: an audit-log failure should never block a user's enrollment or approval; recording is an observability concern, not part of the domain invariant. Alternatives considered: (a) write inside the same transaction — rejected, couples user-visible behaviour to a non-critical secondary concern; (b) outbox pattern with retry — over-engineered for an internal tool at this scale; can be added later if event loss becomes a problem.

### D5. Each ${ChallengesService, EnrollmentsService, SubmissionsService, ReviewsService}.method() gains a constructor-injected `ActivityService`

The five emission points are tightly coupled to the domain logic, so we inject `ActivityService` directly into the existing services. Each call is one line: `await this.activity.record({ userId, type: 'challenge_created', payload: {...} })`. Rationale: keeps the call-site near the code that knows what just happened; avoids the layering complexity of a global event bus. Alternatives considered: (a) NestJS `EventEmitterModule` with `@OnEvent` listeners — adds a layer of indirection that pays off only when listeners multiply, which we don't need yet; (b) database triggers — moves logic out of the application, hard to test, hard to evolve.

### D6. The Activity DTO embeds the actor by joining on `users` at read time

`GET /activity/*` performs a `LEFT JOIN users` on `activity_events.user_id` so the response includes `user: { id, name, avatarUrl }`. Joining at read time (rather than denormalising the user into the payload) means a user who later updates their name or avatar sees the update reflected throughout the feed. Cosmos DB will need to either join in app code or denormalise — that is a Phase 7c decision and does not block us now. Alternatives considered: store `userName` and `userAvatarUrl` in the payload — rejected, freezes stale data and clutters the payload.

### D7. `GET /activity/recent` is public; `/activity/me` requires JWT

Per PRD US-014. The public endpoint returns the same DTO shape but is reachable without an `Authorization` header. Rate-limiting / abuse concerns are deferred to APIM in Phase 7. Rationale: matches the PRD precisely; the dashboard is for an internal org and the feed is a low-stakes social signal.

### D8. `GET /me/stats` returns three counts; soft-deleted challenges are excluded

- `challengesCreated` = `SELECT COUNT(*) FROM challenges WHERE owner_id = :userId AND deleted_at IS NULL`
- `enrollmentsActive` = `SELECT COUNT(*) FROM enrollments WHERE user_id = :userId AND status IN ('in_progress', 'submitted')`
- `enrollmentsApproved` = `SELECT COUNT(*) FROM enrollments WHERE user_id = :userId AND status = 'approved'`

Three separate `COUNT(*)` queries, no transactions needed (counts are advisory, not invariants). Rationale: matches the dashboard tiles the PRD describes ("challenges created, enrolled, approved"); excluding soft-deleted challenges matches Phase 2's spec that soft-deleted challenges are effectively invisible. Alternatives considered: (a) a single aggregated query with `FILTER (WHERE ...)` — fine on Postgres, slightly less portable to Cosmos; (b) cache the counts — premature, the read volume is trivial.

### D9. The endpoint lives on the existing `MeController`, not a new module

`GET /me/stats` is added to `backend/src/me/me.controller.ts` alongside the existing `GET /me/enrollments`. Rationale: it's a single small endpoint, sharing the same auth guard pattern, and the existing controller is the obvious home. Alternatives considered: new `DashboardController` — rejected, premature module proliferation.

### D10. Activity endpoints live in a new `activity/` module

`backend/src/activity/activity.module.ts` exports `ActivityService` so the four feature modules (challenges, enrollments, submissions, reviews) can import it. The module also owns `ActivityController` (`/activity/recent`, `/activity/me`) and the `ActivityEvent` entity. Rationale: keeps the activity domain self-contained and gives Phase 7c a single file to swap the persistence adapter in.

### D11. FE Activity Pinia store with two slices and 30 s polling for global feed

`useActivityStore` exposes:
- state: `recent: ActivityEvent[]`, `mine: ActivityEvent[]`, `loadingRecent`, `loadingMine`, `error`
- actions: `loadRecent()`, `loadMine()`, `startGlobalPolling()`, `stopGlobalPolling()`, `reset()`

`startGlobalPolling()` calls `loadRecent()` immediately, then sets a 30 000 ms interval. The component that mounts the org-wide feed (the home page `ChallengesView`) calls `startGlobalPolling()` in `onMounted` and `stopGlobalPolling()` in `onUnmounted` to avoid runaway timers. Rationale: keeps polling logic in the store so multiple components could subscribe to the same feed without each managing its own timer. Alternatives considered: (a) interval inside the component — simpler but leaks the timer if the component crashes or the user navigates; (b) Vue Query / TanStack Query polling — heavier dependency for a single endpoint.

### D12. Activity feed component (`ActivityTimeline.vue`) is presentational; the store decides what to fetch

The component receives `:events="ActivityEvent[]"` as a prop and renders the timeline. Two views (`MeView` for `mine`, `ChallengesView` for `recent`) bind their respective store slices. Each row shows: actor avatar (`Avatar` PrimeVue), one-line description with the actor's name + a target link (e.g. "Jane enrolled in **Learn Bicep**"), and a relative timestamp (`formatDistanceToNow` from `date-fns`). Rationale: separation between data (store) and presentation (component) keeps the timeline reusable.

### D13. Event-icon and event-text mapping table (FE)

A small `eventCopy` map in the timeline component or a `frontend/src/lib/activity-copy.ts` exports:

```
challenge_created → { icon: 'pi pi-flag',         text: '{actor} created {challengeTitle}' }
enrolled          → { icon: 'pi pi-user-plus',    text: '{actor} enrolled in {challengeTitle}' }
submitted         → { icon: 'pi pi-upload',       text: '{actor} submitted to {challengeTitle}' }
approved          → { icon: 'pi pi-check-circle', text: '{actor}\'s submission to {challengeTitle} was approved' }
rejected          → { icon: 'pi pi-times-circle', text: '{actor}\'s submission to {challengeTitle} was rejected' }
```

Targets are clickable `<router-link>`s into `/challenges/:id`. Rationale: one place to evolve copy without hunting through `.vue` templates.

### D14. Stats card is a single `GET /me/stats` round-trip, NOT computed from existing stores

Even though `enrollmentsStore.myList` could be counted client-side, we go to the BE for stats. Rationale: (a) stats are a future-proof contract that will outlive the current store shape, (b) `challengesCreated` is not available in any existing FE store today, (c) the cost is one tiny query when the user lands on `/me`.

### D15. Migration: one new TypeORM migration creating the enum, table, and two indexes

Generated via `yarn migration:generate -- ./src/migrations/CreateActivityEventsTable`, then hand-edited to ensure:
- The `activity_event_type` enum is created before the table.
- Two indexes are present: `IDX_activity_events_created_at` on `(created_at DESC)` and `IDX_activity_events_user_id_created_at` on `(user_id, created_at DESC)`.
- The `down()` method drops the table, then the enum, in that order.

Rationale: TypeORM generators have historically missed `DESC`-ordered indexes (we hit this on every prior phase) and sometimes generate spurious `DROP CONSTRAINT` lines (Phase 4 + Phase 5 both had this) — a hand review is mandatory.

### D16. Soft-deleted entities and the feed

When a challenge is soft-deleted **after** events referencing it are recorded, those events remain in the feed and the `challengeTitle` in the payload renders as-is. The `<router-link>` to a soft-deleted challenge produces a 404 page; we accept this as the simplest behaviour. Rationale: an activity log is a historical record; rewriting history when a challenge is deleted would change semantics. Alternative considered: scrub events whose target is deleted — rejected, complicates the read path and contradicts the audit-log nature.

### D17. Stats endpoint excludes soft-deleted challenges; activity feed does not retroactively filter

These two rules together mean: a user who creates 3 challenges and soft-deletes 1 sees `challengesCreated: 2` on their stats card, but their `Recent Activity` panel still shows the 3 `challenge_created` events. Rationale: the stats card is a current-state metric; the activity log is a historical metric.

## Risks / Trade-offs

- [Activity recording slows down user-facing endpoints] → Mitigation: D4 — recording happens after the originating transaction commits, on a path that doesn't block the response. We `await` the recording call so any logging happens before we return, but the failure path swallows the error.
- [Postgres → Cosmos migration in Phase 7c could leak schema details into the FE] → Mitigation: D6 and D10 — the persistence adapter is a single class behind an injected interface; the controller, DTOs, and FE see only the DTO shape.
- [Public `GET /activity/recent` could leak data in production] → Mitigation: DTOs explicitly exclude email and any sensitive payload (D3). Rate limiting is handled by APIM in Phase 7. The data exposed is intentional per PRD.
- [30 s polling × N tabs of N users could pressure the BE] → Mitigation: for the internal Vitalify scale this is a non-issue; if it becomes one in Phase 7, we move to SSE or shorten the window when the tab is hidden. Today, accept the cost.
- [Event volume on a popular challenge could push old events out of the "last 50" before they're read] → Mitigation: this is a "feed", not a notification system. Acceptable behaviour. The PRD explicitly says "last 50".
- [Generated migration includes spurious DROP statements (recurring problem in Phases 4–5)] → Mitigation: D15 — explicit hand-review step in the tasks list; we have a known pattern for cleaning these up.
- [TypeORM's enum-creation behaviour with `down()` order] → Mitigation: tasks explicitly check the `down()` ordering (drop table, then drop enum, then `migration:revert` round-trip test).
- [Soft-deleted challenges leaving orphan timeline rows] → Mitigation: D16 — accepted behaviour, documented in spec scenarios.
- [FE timer leaks between routes] → Mitigation: D11 — `onUnmounted` calls `stopGlobalPolling`; store also exposes an idempotent stop in case of double calls.

## Migration Plan

1. **Generate & hand-edit migration**: `yarn migration:generate -- ./src/migrations/CreateActivityEventsTable`; clean spurious lines; confirm enum + table + 2 indexes; verify `down()` ordering.
2. **Apply migration locally**: `yarn migration:run`; verify `\d activity_events` shows expected schema; `yarn migration:revert` round-trip.
3. **Implement BE module** (entity, DTOs, service, controller, module wiring).
4. **Wire into existing services** — one inject + one call per service. Add unit-test assertions that `record(...)` is called on success and NOT called on failure.
5. **Add `/me/stats`** endpoint on existing `MeController`.
6. **Verify BE gates green** (`yarn lint && yarn test && yarn tsc --noEmit`).
7. **Implement FE types, API client, store, components**.
8. **Wire MeView** (stats card + Recent Activity).
9. **Wire ChallengesView** (org-wide feed + 30 s polling).
10. **Verify FE gates green** (`yarn type-check && yarn build`).
11. **Browser verification** — full org loop with two accounts.

**Rollback strategy:** A single `yarn migration:revert` drops the `activity_events` table and enum; FE changes can be reverted via git revert of the Phase 6 commits. Because activity recording is non-blocking (D4), removing the table mid-deployment would just produce error-log lines and not break user-facing endpoints — but we won't actually do that, this is a forward-only feature.

## Open Questions

- **Should the org-wide feed live on `/` (home) or be a sidebar everywhere?** Going with `/` (current `ChallengesView`) for Phase 6 — keeps the surface area small. A persistent sidebar could be a follow-up.
- **Do we want client-side filtering by event type?** Deferred to a follow-up. Phase 6 ships the unfiltered feed; if it's noisy we add filters later.
- **Do we need a "no activity yet" empty state design beyond plain text?** Phase 6 ships plain text; visual polish can follow once we see real data.
