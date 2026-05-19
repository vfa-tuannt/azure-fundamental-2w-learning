## Context

Phase 1 delivered authentication: there is a `users` table, a `JwtAuthGuard`, and a Pinia `authStore`. The `/challenges` and `/challenges/:id` routes exist in the router but render placeholder views, and there is no domain table beyond `users`. Phase 2 introduces the first real business object — the challenge — and the full CRUD surface (BE endpoints + FE views) that members will use every day. This is also the first phase that has to make decisions about list pagination, filtering, soft-delete semantics, and rich-text content; those decisions will be reused by Phase 4 (submissions) and Phase 5 (review).

Constraints from the PRD (US-005, US-006, US-007):
- The `challenges` table schema is fixed (columns and types are listed in PRD §8)
- `GET /challenges` and `GET /challenges/:id` are **public** (no auth); mutations are owner-only
- Description is markdown; the FE renders it with `md-editor-v3` in both edit and viewer modes
- Soft-delete via `deleted_at` (no hard delete)
- The list response must include `enrollments_count`, even though enrollments do not yet exist in Phase 2

## Goals / Non-Goals

**Goals:**
- A logged-in member can create a challenge with title, markdown description, skill tags, deadline, and an optional enrollment cap, and immediately see it on the list page
- Anyone (auth or not) can browse the list and open a detail page; pagination + skill/status filters work without page reloads
- Only the owner sees Edit/Delete; non-owners get 403 if they call the endpoints directly
- Deletion is reversible (soft-delete) so accidental clicks do not destroy data; list queries hide soft-deleted rows by default
- The list response shape is forward-compatible: `enrollments_count` is in the payload from day one, just defaulted to 0 until Phase 3 populates it

**Non-Goals:**
- No enrollment logic, no submissions, no review (those are Phases 3-5)
- No full-text search on description — `?skill=` filters the array column only
- No admin "see all soft-deleted" or undelete endpoint — soft-delete is a safety net, not a feature
- No file/image upload inside the markdown description (out of scope; users can paste external URLs)
- No optimistic-UI on list mutations — the create/edit form navigates back to the detail page on success
- No real-time updates (polling/WebSockets) — list is fetched on mount and on filter change only
- No role/permission system — every authenticated Vitalify user can create challenges; ownership is the only access rule

## Decisions

**D1 — `challenges` table uses Postgres `text[]` for `required_skills`, not a join table**
The PRD specifies `text[]`. We keep it: a single `text[]` column with a GIN index gives us fast `?skill=` filtering (`WHERE required_skills && ARRAY[$1]::text[]`) without a join. Skill tags are short, free-form strings entered by the challenge author — there is no global skill catalog in v1 and PRD §6 explicitly excludes "AI skill-matching". A normalised `skills` + `challenge_skills` pair would buy us nothing here and would force a join on every list query.

Rationale: matches PRD literal schema; cheap to query; no skill-catalog work needed. Alternative (join table) costs an extra entity, extra migration, and slower list queries for a benefit (referential integrity, autocomplete) we do not need yet.

**D2 — Soft-delete via `deleted_at` column with a TypeORM `@DeleteDateColumn`**
TypeORM's `@DeleteDateColumn` makes `repository.softRemove(entity)` set the timestamp and makes `repository.find()` exclude rows automatically. We keep this behaviour everywhere except the (currently nonexistent) admin/restore path. The unique constraints we care about are on `users.email`, not on challenges, so the soft-delete column does not interact with uniqueness.

Rationale: built into TypeORM, zero extra code in queries. Alternative (manual `WHERE deleted_at IS NULL` in every query) is error-prone — one forgotten clause leaks deleted rows.

**D3 — Status is a Postgres enum, defaulted to `open` on insert**
`status` has exactly two values today (`open`, `closed`). We model it as a Postgres `enum` type rather than a `varchar` with a check constraint, because TypeORM has first-class enum support and the migration is self-documenting. Future values (e.g. `archived`) can be added with a single `ALTER TYPE ... ADD VALUE`.

Rationale: enum is the most explicit, queryable form. Alternative (string + check constraint) gives the same guarantees but reads worse in psql.

**D4 — `enrollments_count` is computed in the service layer and defaulted to 0 in Phase 2**
The list and detail responses include `enrollments_count: number`. In Phase 2 the field is hard-coded to 0 in `ChallengesService.toDto()`. In Phase 3, that single method swaps to a subquery (`SELECT COUNT(*) FROM enrollments WHERE challenge_id = ...`) or a `LEFT JOIN` with `COUNT(*) GROUP BY challenge.id`. The DTO contract is set now so the frontend table column `Enrolled/Max` never has to change.

Rationale: freezes the response shape early. Alternative (omit the field until Phase 3) forces a FE update later and a coordinated BE+FE deploy in the middle of Phase 3.

**D5 — Pagination uses offset (`?page=&limit=`), not cursor**
The PRD asks for `?page=&limit=`. We honour that. Defaults: `page=1`, `limit=20`, `max limit=100`. Returns `{ items, page, limit, total }`. With an index on `(status, deleted_at, created_at DESC)` offset pagination is fine for an internal tool with hundreds of rows. A cursor-based scheme would be overkill and would break the "click page N" UX that PrimeVue's Paginator expects.

Rationale: matches PRD; matches PrimeVue idiom. Alternative (cursor) is the right call only at >100k rows or for infinite-scroll, neither of which applies.

**D6 — Filters: `?status=` is a single enum value; `?skill=` is a case-insensitive substring against any element of `required_skills`**
Status filter: optional, must be `open` or `closed`; 400 if anything else. Skill filter: optional; the SQL is `EXISTS (SELECT 1 FROM unnest(required_skills) s WHERE s ILIKE $1)` with `$1 = '%' || filter || '%'`. This lets a user type "azure" and find challenges tagged `Azure Functions`, `Azure ARM`, `AzureAD`. We index `required_skills` with `GIN` for future strict-match queries even though the Phase 2 query uses `ILIKE` (the GIN index supports `&&` and `@>`, not `ILIKE`; the `EXISTS … ILIKE` path is fine for the current scale and we will revisit if it becomes hot).

Rationale: the user behaviour we want is "type any fragment". Alternative (exact match against the array via `&& ARRAY[$1]`) is faster but forces the user to know the exact tag spelling, which is unrealistic.

**D7 — Ownership enforcement lives in the service, not the controller**
The service methods `update(id, userId, dto)` and `remove(id, userId)` load the entity, compare `entity.ownerId !== userId`, and throw `ForbiddenException`. The controller is a thin shim that pulls `req.user.id` and passes it through. This keeps the rule testable in isolation and makes it impossible to call the service without an owner check.

Rationale: one place to audit the rule. Alternative (controller-level guard with `meta` reflection) is heavier and not reusable for the upcoming Phase 5 (submission review) where the same ownership concept applies to a related entity.

**D8 — Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true`**
We register the pipe once in `main.ts`. DTOs use `class-validator` decorators (`@IsString`, `@IsArray`, `@IsDateString`, `@IsInt`, `@Min`, `@IsOptional`, `@IsEnum`). Validation failures return HTTP 400 with NestJS's default error envelope. `transform: true` converts query strings (`page`, `limit`) to numbers automatically. `forbidNonWhitelisted: true` rejects unknown fields — important to avoid clients silently sending `status: "closed"` on create.

Rationale: a single centralised pipe means every future controller (enrollments, submissions, review) inherits the same validation rules for free. Alternative (per-route `@UsePipes`) duplicates configuration.

**D9 — `md-editor-v3` in both edit and viewer modes**
The PRD names `md-editor-v3`. The library has a single component that accepts a `preview-only` prop, which is exactly what the detail page needs. We import the CSS once in `main.ts` (`md-editor-v3/lib/style.css`) and use the component in both views. Markdown is stored raw in the DB; the FE renders it. No server-side rendering or sanitisation in Phase 2 — because content is authored by trusted Vitalify users and the library already escapes by default.

Rationale: PRD-specified; Vue 3 native; same component for edit and view. Alternative (separate editor + renderer libraries) doubles the bundle and creates drift.

**D10 — `Challenge` API types are shared via `src/api/types.ts`, no codegen yet**
The PRD mentions OpenSpec-driven codegen for API types. In practice for Phase 2 we hand-write the interfaces in `frontend/src/api/types.ts` (next to the existing `User` type from Phase 1) to keep the change focused. A codegen step can be added in a later phase without rewriting the call sites — the hand-written shape is identical to what the generator would emit.

Rationale: keeps Phase 2 scope tight; the OpenSpec proposal is still the source of truth even without codegen. Alternative (introduce codegen now) is a separate cross-cutting concern best done as its own change.

**D11 — `ChallengeFormView` is a single component for both create and edit**
Routes `/challenges/new` and `/challenges/:id/edit` both render `ChallengeFormView.vue`. The component reads `route.params.id` on mount; if present, it fetches the challenge and pre-fills the form, otherwise it starts empty. Submission picks `POST` or `PATCH` based on the same flag. This avoids duplicating the form, the validators, and the markdown editor configuration.

Rationale: one form, one set of bugs. Alternative (two components) duplicates ~200 lines of template.

## Risks / Trade-offs

- [`required_skills` ILIKE scan does not use the GIN index] → Mitigation: acceptable at expected scale (≤ a few hundred challenges). If the list query gets slow we can add a separate trigram (`pg_trgm`) index, or change the filter UX to exact-match with autocomplete.
- [Markdown stored raw and rendered client-side] → Mitigation: `md-editor-v3` escapes HTML by default; we never bypass it with `v-html` on the raw string. The platform is internal-only (Vitalify employees with verified Google identities), which keeps the threat model small.
- [Soft-delete leaves orphan-looking FKs in future tables] → Mitigation: Phase 3 enrollments will join with `deleted_at IS NULL` when listing user enrollments, so a deleted challenge becomes invisible to enrollees automatically. The FK itself stays valid because we never hard-delete.
- [Offset pagination becomes expensive at large offsets] → Mitigation: limits capped at 100, plus internal-tool scale. We will revisit only if a list-load alert fires.
- [Frozen `enrollments_count: 0` is a misleading number until Phase 3] → Mitigation: Phase 3 starts immediately after Phase 2 and is the very next change. The PRD calls this out (US-006 acceptance criteria mention `Enrolled/Max`); the FE column already renders "0/N" or "0/—" until Phase 3 swaps the data source.
- [Global `forbidNonWhitelisted: true` could break a future client that sends extra fields] → Mitigation: this is the intended behaviour for an internal API — extra fields almost always indicate a client/server mismatch we want to surface, not silently swallow.

## Migration Plan

1. Generate a TypeORM migration `CreateChallengesTable` that:
   - creates the `challenge_status` enum (`open`, `closed`)
   - creates the `challenges` table with the columns listed in proposal.md
   - adds a FK `challenges.owner_id → users.id` (`ON DELETE RESTRICT`)
   - adds an index on `(status, deleted_at, created_at DESC)` for list queries
   - adds a `GIN` index on `required_skills`
2. Run `npm run migration:run` against local Postgres; verify in pgAdmin.
3. Deploy is local-only in Phase 2 — no Azure migration needed. The same migration will run unmodified in Azure in Phase 7 because Azure Database for PostgreSQL Flexible Server is wire-compatible with Postgres 16.
4. **Rollback**: `npm run migration:revert` drops the table, the indexes, and the enum type in reverse order. The migration's `down()` is generated by TypeORM and we hand-verify it before commit.

## Open Questions

None. Every Phase 2 design choice is anchored to the PRD or to a Phase 1 precedent (e.g. how we model env vars, how we structure modules). Phase 3 (enrollments) starts with the same scaffolding and will only need to add a `JOIN ... GROUP BY` to swap the `enrollments_count: 0` placeholder.
