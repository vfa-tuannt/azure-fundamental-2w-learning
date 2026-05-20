## Why

The platform now supports the full create-enroll-submit-review loop (Phases 0–5), but a user has no way to see what is happening across the org or measure their own contribution at a glance. Phase 6 closes the loop with an **activity feed** that records key domain events (`challenge_created`, `enrolled`, `submitted`, `approved`, `rejected`) and a **richer `/me` dashboard** that shows a profile card, headline stats, and a live timeline. This is the last local-only phase before Azure deployment (Phase 7), so the activity layer is built on Postgres for now with a clean enough boundary that Phase 7c can swap the persistence to Cosmos DB without touching the FE.

## What Changes

- **NEW activity event log on the BE.** Add an `activity_events` table (`id`, `user_id` FK to users, `event_type` enum [`challenge_created` | `enrolled` | `submitted` | `approved` | `rejected`], `payload` JSONB, `created_at` timestamptz) and an `ActivityService` that wraps insert + list operations. The service is injected into existing services (challenges, enrollments, submissions, reviews) which call `activityService.record(...)` after each successful mutation. Recording failures are logged but do NOT roll back the originating transaction — events are best-effort and the user-visible action takes priority.
- **NEW activity endpoints.**
  - `GET /activity/recent` — last 50 events across all users; **public** (no auth required, per PRD US-014); newest-first; each item embeds the actor (`user`) and a small target descriptor (`challenge.id`, `challenge.title`, plus `submission.id` for submission events) so the FE can render the timeline without N+1 fetches.
  - `GET /activity/me` — last 50 events for the authenticated caller; same shape; auth required.
- **NEW dashboard stats endpoint.** `GET /me/stats` — auth required; returns `{ challengesCreated, enrollmentsActive, enrollmentsApproved }` computed from existing tables. This keeps the stats card a single round-trip from the FE.
- **MODIFIED `/me` view.** The existing My Challenges table stays; above it, the FE adds a **profile card** (avatar, name, email) — currently a plain header — extended to include three stat tiles (Challenges Created, In-Progress Enrollments, Approved Enrollments) and below it a **Recent Activity panel** showing the user's last 50 events with relative timestamps and event icons. A separate **Org-wide Activity** panel (also visible to unauthenticated visitors on `/`, the home route) renders the global feed and auto-refreshes every 30 seconds.
- **MODIFIED backend services to emit events.** `ChallengesService.create`, `EnrollmentsService.enroll`, `SubmissionsService.createFileSubmission` + `createUrlSubmission`, and `ReviewsService.approve` + `reject` each call into `ActivityService.record(...)` after their database transaction commits.
- **Capability boundary note.** The activity-event entity and endpoints are a new capability (`backend-activity`); the call-sites that emit events live inside their respective existing capabilities, so those specs get small modifications (one new requirement / scenario each) saying "this action emits an activity event."
- **No breaking changes.** All existing endpoints keep their response shapes. Activity recording is fire-and-forget from the caller's perspective.

## Capabilities

### New Capabilities
- `backend-activity`: Activity-event persistence (`activity_events` table) plus the `ActivityService` and two endpoints (`GET /activity/recent`, `GET /activity/me`). Defines the event-type enum, the payload contract per event type, the DTO shape (with embedded actor + target), and the 50-row newest-first response semantics.
- `backend-dashboard`: The `/me/stats` endpoint shape and its computation rules (counts derived from `challenges` and `enrollments` tables, soft-deleted challenges excluded).
- `frontend-activity`: The typed activity API client, the activity Pinia store, the timeline component, the dashboard stats card, and the home-page org-wide feed with 30 s polling. Defines how each event type maps to an icon and a human-readable line.

### Modified Capabilities
- `backend-challenges`: Add a requirement that a successful `POST /challenges` emits a `challenge_created` activity event recorded against the creating user with payload `{ challengeId, title }`.
- `backend-enrollments`: Add a requirement that a successful `POST /challenges/:id/enroll` emits an `enrolled` activity event with payload `{ challengeId, challengeTitle, enrollmentId }`.
- `backend-submissions`: Add a requirement that a successful `POST /enrollments/:id/submissions` emits a `submitted` activity event with payload `{ submissionId, enrollmentId, challengeId, challengeTitle, kind: 'file' | 'url' }`.
- `backend-reviews`: Add requirements that successful `POST /submissions/:id/approve` and `POST /submissions/:id/reject` emit `approved` / `rejected` events recorded against the **submitter** (not the reviewing owner) with payload `{ submissionId, enrollmentId, challengeId, challengeTitle, reviewerId, rejectionReason? }`.
- `frontend-enrollments`: Extend the `/me` view requirement from "profile header + My Challenges table" to "profile header + stats tiles + My Challenges table + Recent Activity panel"; the My Challenges table itself is unchanged.

## Impact

- **Backend code:** new `activity/` and `me-stats/` (or extension of existing `me/`) modules; small constructor injection into `ChallengesService`, `EnrollmentsService`, `SubmissionsService`, `ReviewsService`. One new TypeORM migration creating the `activity_events` table and its index `(created_at DESC)`.
- **Backend tests:** new unit tests for `ActivityService` and the stats endpoint; existing service tests get a mocked `ActivityService` dependency and assert that `record(...)` is invoked exactly once per successful path. New E2E tests for the two activity routes and the stats route.
- **Frontend code:** new `src/api/activity.ts`, `src/stores/activity.ts`, `src/components/ActivityTimeline.vue`, `src/components/StatsTiles.vue`. `MeView.vue` is extended; `HomeView.vue` (or the existing `ChallengesView.vue` index page — TBD in design) gets the org-wide feed.
- **API contract:** two new public endpoints, one new authenticated endpoint, and stable shapes for all existing endpoints. No breaking changes for the FE consumer or any external caller.
- **Dependencies:** no new runtime dependencies expected; `class-validator`, TypeORM, `@nestjs/typeorm`, `pg` are already present on the BE, and PrimeVue + Pinia + axios + `date-fns` (already used for relative timestamps) cover the FE.
- **Azure migration readiness (Phase 7c):** the `ActivityService` interface is the swap point. Once Cosmos DB is in place, only the persistence adapter changes; the controller, the DTOs, and the FE remain stable. The `activity_events` Postgres table is dropped in Phase 7c per PRD US-022.
