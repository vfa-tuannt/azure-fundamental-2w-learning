## 1. Backend — Dependencies and Validation

- [ ] 1.1 Install backend packages: `class-validator`, `class-transformer`
- [ ] 1.2 In `backend/src/main.ts`, register a global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }`
- [ ] 1.3 Confirm `app.useGlobalPipes(...)` runs before `app.listen()` and that `npm run start:dev` still boots clean

## 2. Backend — Challenge Entity and Migration

- [ ] 2.1 Create `backend/src/challenges/challenge.entity.ts` with `Challenge`: `id` (`@PrimaryGeneratedColumn('uuid')`), `ownerId` (`@Column('uuid')`), `owner` (`@ManyToOne(() => User)` with `JoinColumn({ name: 'owner_id' })`), `title` (`@Column('varchar')`), `description` (`@Column('text')`), `requiredSkills` (`@Column('text', { array: true, default: '{}' })`), `deadline` (`@Column('timestamptz')`), `maxEnrollments` (`@Column('int', { nullable: true })`), `status` (`@Column({ type: 'enum', enum: ChallengeStatus, default: ChallengeStatus.OPEN })`), `createdAt` (`@CreateDateColumn()`), `deletedAt` (`@DeleteDateColumn()`)
- [ ] 2.2 Add a `ChallengeStatus` TypeScript enum (`OPEN = 'open'`, `CLOSED = 'closed'`) and the matching Postgres enum name `challenge_status`
- [ ] 2.3 Register `Challenge` in `data-source.ts` `entities` array
- [ ] 2.4 Generate migration: `npm run migration:generate -- ./src/migrations/CreateChallengesTable`; review the generated SQL to ensure: enum type, FK to `users.id` with `ON DELETE RESTRICT`, index on `(status, deleted_at, created_at DESC)`, and a `GIN` index on `required_skills`. Hand-add the GIN index in the migration if TypeORM did not emit it.
- [ ] 2.5 Run `npm run migration:run`; verify in pgAdmin that the `challenges` table, the enum, and both indexes exist
- [ ] 2.6 Spot-check the migration's `down()` drops the table, the indexes, and the enum cleanly

## 3. Backend — Challenges DTOs

- [ ] 3.1 Create `backend/src/challenges/dto/create-challenge.dto.ts` with `@IsString @IsNotEmpty title`, `@IsString @IsNotEmpty description`, `@IsArray @IsString({ each: true }) requiredSkills`, `@IsDateString` + custom `@MinDate(now)` `deadline`, `@IsOptional @IsInt @Min(1) maxEnrollments`
- [ ] 3.2 Create `backend/src/challenges/dto/update-challenge.dto.ts` as `PartialType(CreateChallengeDto)` plus `@IsOptional @IsEnum(ChallengeStatus) status`
- [ ] 3.3 Create `backend/src/challenges/dto/list-challenges.query.dto.ts` with `@Type(() => Number) @IsInt @Min(1) @IsOptional page`, `@Type(() => Number) @IsInt @Min(1) @Max(100) @IsOptional limit`, `@IsOptional @IsEnum(ChallengeStatus) status`, `@IsOptional @IsString skill`
- [ ] 3.4 Create `backend/src/challenges/dto/challenge.dto.ts` (response shape with camelCase fields including `enrollmentsCount: number`)

## 4. Backend — Challenges Service

- [ ] 4.1 Create `ChallengesService` at `backend/src/challenges/challenges.service.ts` with the TypeORM repository for `Challenge`
- [ ] 4.2 `create(ownerId, dto)`: inserts and returns the DTO with `enrollmentsCount: 0`
- [ ] 4.3 `findAll(query)`: builds a query with `WHERE deleted_at IS NULL`, optional `status` equality, optional `EXISTS (SELECT 1 FROM unnest(required_skills) s WHERE s ILIKE $1)` for `skill`; orders by `created_at DESC`; applies `LIMIT/OFFSET`; returns `{ items, page, limit, total }`
- [ ] 4.4 `findOne(id)`: returns the row (excluding soft-deleted) or throws `NotFoundException`
- [ ] 4.5 `update(id, userId, dto)`: loads the row (excluding soft-deleted); throws `NotFoundException` if missing; throws `ForbiddenException` if `ownerId !== userId`; merges and saves
- [ ] 4.6 `remove(id, userId)`: loads the row (excluding soft-deleted); throws `NotFoundException` if missing; throws `ForbiddenException` if `ownerId !== userId`; calls `repo.softRemove(entity)`
- [ ] 4.7 Add `private toDto(entity): ChallengeDto` mapping snake_case columns to camelCase and hard-coding `enrollmentsCount: 0`

## 5. Backend — Challenges Controller and Module

- [ ] 5.1 Create `ChallengesController` at `backend/src/challenges/challenges.controller.ts` with route prefix `/challenges`
- [ ] 5.2 `@Post()` `create` — `@UseGuards(JwtAuthGuard)`, takes `@Body() dto`, `@CurrentUser() user`; calls `service.create(user.id, dto)`; returns 201 with the DTO
- [ ] 5.3 `@Get()` `list` — public, `@Query() query: ListChallengesQueryDto`; returns the paginated list
- [ ] 5.4 `@Get(':id')` `detail` — public, returns the DTO or 404
- [ ] 5.5 `@Patch(':id')` `update` — `@UseGuards(JwtAuthGuard)`; returns the DTO; 403 on non-owner, 404 on missing
- [ ] 5.6 `@Delete(':id')` `remove` — `@UseGuards(JwtAuthGuard)`; returns 204; 403 on non-owner, 404 on missing
- [ ] 5.7 Create a `@CurrentUser()` param decorator in `backend/src/auth/decorators/current-user.decorator.ts` if not already present, returning `req.user`
- [ ] 5.8 Create `ChallengesModule` importing `TypeOrmModule.forFeature([Challenge])` and exporting `ChallengesService` for future use; register it in `AppModule`

## 6. Backend — Tests

- [ ] 6.1 Unit test `ChallengesService.create`: writes a row owned by the supplied user and returns DTO with `enrollmentsCount: 0`
- [ ] 6.2 Unit test `ChallengesService.update`: throws `ForbiddenException` when caller is not the owner; succeeds when caller is the owner
- [ ] 6.3 Unit test `ChallengesService.remove`: calls `softRemove` for the owner; throws `ForbiddenException` for non-owner; throws `NotFoundException` when already soft-deleted
- [ ] 6.4 Unit test `ChallengesService.findAll`: returns paginated result with `total`; respects `status` and `skill` filters; excludes soft-deleted rows
- [ ] 6.5 E2E (or supertest controller test): `POST /challenges` without JWT → 401; with invalid body → 400; with valid body + JWT → 201; `GET /challenges` works without auth and returns paginated results; `PATCH/DELETE` non-owner → 403
- [ ] 6.6 Run `npm run lint`, `npm run test`, and `npx tsc --noEmit` — all clean

## 7. Frontend — Dependencies and Types

- [ ] 7.1 Install `md-editor-v3` in `frontend/`
- [ ] 7.2 Import the editor CSS once in `frontend/src/main.ts` (`import 'md-editor-v3/lib/style.css'`)
- [ ] 7.3 In `frontend/src/api/types.ts`, add `ChallengeStatus`, `Challenge`, `ChallengeListResponse`, `CreateChallengeDto`, `UpdateChallengeDto`, `ListChallengesParams` matching the backend DTOs (camelCase, `enrollmentsCount: number`, `maxEnrollments: number | null`)

## 8. Frontend — API Client and Store

- [ ] 8.1 Create `frontend/src/api/challenges.ts` exporting typed wrappers: `listChallenges(params)`, `getChallenge(id)`, `createChallenge(dto)`, `updateChallenge(id, dto)`, `deleteChallenge(id)` — each using the shared Axios instance
- [ ] 8.2 Create `frontend/src/stores/challenges.ts` Pinia store with state `{ items, page, limit, total, filters: { skill: '', status: null }, loading: false, error: null }` and actions `fetchList(params?)`, `setFilters(filters)`, `setPage(page)`, `reset()`
- [ ] 8.3 In `setFilters`, set `page = 1` and dispatch `fetchList()`

## 9. Frontend — Router

- [ ] 9.1 Add routes in `frontend/src/router/index.ts`: `/challenges/new` → `ChallengeFormView`, `/challenges/:id/edit` → `ChallengeFormView`; ensure both go through the existing global guard (no special `meta.public`)
- [ ] 9.2 Ensure `/challenges/:id` (existing route) maps to the updated `ChallengeDetailView`

## 10. Frontend — Challenges List View

- [ ] 10.1 Rewrite `frontend/src/views/ChallengesView.vue` using PrimeVue `DataTable` lazy mode bound to the `challengesStore`
- [ ] 10.2 Columns: Title; Skills (template slot renders `Tag` chips iterating `requiredSkills`); Deadline (locale date); Enrolled/Max (template renders `${enrollmentsCount}/${maxEnrollments ?? '—'}`); Status (`Tag` with severity `success` for `open`, `secondary` for `closed`)
- [ ] 10.3 Filter bar: PrimeVue `InputText` for skill (debounced) + `Select` for status (options `All`, `Open`, `Closed`) wired to `store.setFilters`
- [ ] 10.4 `Paginator` wired to `store.setPage`; `totalRecords = store.total`
- [ ] 10.5 Row click navigates to `/challenges/:id`
- [ ] 10.6 "Create Challenge" `Button` visible when `authStore.isAuthenticated`; navigates to `/challenges/new`

## 11. Frontend — Challenge Detail View

- [ ] 11.1 Rewrite `frontend/src/views/ChallengeDetailView.vue`: on mount fetch `getChallenge(route.params.id)`; show loading skeleton; show "not found" state on 404
- [ ] 11.2 Render title (heading), skills as `Tag` chips, deadline (locale date), enrolled count, owner name (resolved from `auth/me` if owner, otherwise show the bare id for now — note: owner display name will be enriched in a later phase)
- [ ] 11.3 Render description via `<MdPreview :modelValue="challenge.description" />` from `md-editor-v3`
- [ ] 11.4 If `authStore.user?.id === challenge.ownerId`, show "Edit" button (navigates to `/challenges/:id/edit`) and "Delete" button (opens PrimeVue `ConfirmDialog`)
- [ ] 11.5 On confirmed delete, call `deleteChallenge(id)`, navigate to `/challenges`, show success Toast; on error show error Toast and stay on the page

## 12. Frontend — Challenge Form View

- [ ] 12.1 Create `frontend/src/views/ChallengeFormView.vue`; if `route.params.id` is present, on mount call `getChallenge(id)` and pre-fill form state, otherwise initialise empty state with `status: 'open'`
- [ ] 12.2 Form fields: Title (`InputText`), Description (`<MdEditor v-model="form.description" />`), Skills (`Chips`), Deadline (`DatePicker showTime`), Max Enrollments (`InputNumber`, optional)
- [ ] 12.3 Client-side validation: title non-empty; deadline strictly in the future. Show inline messages; disable submit while invalid
- [ ] 12.4 On submit, call `createChallenge(dto)` or `updateChallenge(id, dto)` based on the route; on success navigate to `/challenges/<id>` and show success Toast
- [ ] 12.5 On API error, display an error Toast with a message taken from the response body; do not clear the form

## 13. Frontend — Verification

- [ ] 13.1 Run `yarn build` and confirm exit code 0 (typecheck + bundle clean)
- [ ] 13.2 With both BE (`npm run start:dev`) and FE (`yarn dev`) running, visit `/challenges` while logged out — confirm the table loads (public) and the "Create Challenge" button is hidden
- [ ] 13.3 Log in as a Vitalify user, click "Create Challenge", fill the form (including a markdown description with headers + code block), submit — confirm redirect to detail page with the description rendered as HTML
- [ ] 13.4 Confirm the new challenge appears in the list page; use the skill filter (case-insensitive substring) and the status filter; use the paginator
- [ ] 13.5 As the owner, click "Edit", change the title and deadline, save — confirm the detail page reflects the updates
- [ ] 13.6 As the owner, click "Delete", confirm — confirm redirect to list and the challenge no longer appears (verify in pgAdmin: `deleted_at IS NOT NULL`)
- [ ] 13.7 As a different Vitalify account, attempt `PATCH /challenges/:id` and `DELETE /challenges/:id` via `curl` for someone else's challenge — confirm HTTP 403
- [ ] 13.8 Confirm `GET /challenges?status=archived` and `GET /challenges?limit=999` both return HTTP 400
