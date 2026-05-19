# Skill Challenge Platform — AI working agreement

Read this file before doing anything. The rules below are non-negotiable. If a request appears to contradict them, ask before deviating.

## 1. Toolchain (DO NOT switch)

- **Node:** 24.13.0 only. Pinned in `.nvmrc` and in both `backend/package.json` and `frontend/package.json` `engines.node`. Run `nvm use` at the repo root before anything else.
  - If `yarn` errors with `The engine "node" is incompatible … Got "<other version>"`, your `$PATH` has Homebrew (or another) Node ahead of nvm. Confirm with `which node`. Fix by prepending the nvm bin to `$PATH` for the session: `export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"`, or by reordering `~/.zshrc` so `nvm.sh` is sourced AFTER the Homebrew/PATH lines.
- **Package manager:** **yarn 1.22.22 only.** Never `npm install`, `npm i`, `npm add`, `npm ci`, `npm run`, or `npx <thing-that-installs>`. The lockfile is `yarn.lock`. A stray `npm install` will create `package-lock.json`, which is gitignored, but please don't create it in the first place.
- **One lockfile per app:** `backend/yarn.lock` and `frontend/yarn.lock`. Never delete them, never regenerate them just to "clean things up."
- **Allowed commands cheatsheet:**

  | Intent | Use | Never |
  |---|---|---|
  | Install all deps | `yarn install` | `npm install`, `npm ci` |
  | Add a dep | `yarn add <pkg>` | `npm install <pkg>` |
  | Add a dev dep | `yarn add -D <pkg>` | `npm install --save-dev <pkg>` |
  | Remove a dep | `yarn remove <pkg>` | `npm uninstall <pkg>` |
  | Run a script | `yarn <script>` | `npm run <script>` |
  | Run a one-off binary | `yarn <bin>` (or `yarn dlx <bin>` if not in deps) | `npx <bin>` for anything that installs |

  `npx` is OK for read-only one-shots that are already in node_modules (e.g. `npx tsc --noEmit`), but prefer `yarn tsc --noEmit` for consistency.

## 2. Project structure (don't reinvent)

- `backend/` — NestJS 11 + TypeORM + Postgres. Source in `src/`. Migrations in `src/migrations/` (TypeORM CLI, never `synchronize: true`).
- `frontend/` — Vue 3 + Vite + PrimeVue + Pinia + Tailwind. Source in `src/`.
- `openspec/` — spec-driven workflow. `openspec/specs/<capability>/spec.md` is the source of truth. Changes are proposed in `openspec/changes/<name>/` and archived after implementation.
- `docker-compose.yml` — local Postgres 16 + pgAdmin + Azurite. Always start here for local dev (`docker compose up -d`).
- `tasks/` (sibling of this project, at the repo root above) — contains the PRD. Do not edit the PRD without explicit instruction.

## 3. Spec-driven workflow (OpenSpec)

- Before writing code for a new phase or feature, the change must exist under `openspec/changes/<name>/` with `proposal.md`, `design.md`, `specs/**/spec.md`, and `tasks.md` (run `openspec validate <name> --strict`).
- When implementing tasks, mark the checkbox in `tasks.md` (`- [ ]` → `- [x]`) as soon as the task is genuinely done — don't batch.
- If implementation reveals a design issue, **stop coding** and update the proposal / design / specs first, then continue. Do not silently drift from the spec.
- The PRD (`tasks/prd-skill-challenge-platform.md`) describes phases; each phase corresponds to one OpenSpec change.

## 4. Backend conventions

- Every controller mutation must be authenticated with `@UseGuards(JwtAuthGuard)`. Public reads are explicit; everything else is gated.
- DTOs use `class-validator` decorators. The global `ValidationPipe` in `main.ts` runs with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` — do not weaken these settings.
- Ownership/permission rules live in the service layer (`update(id, userId, dto)`), not the controller. Controllers should be a one-line shim.
- Entities use camelCase TypeScript properties mapped to snake_case columns via `@Column({ name: 'foo_bar' })`. Responses are camelCase via a `toDto()` mapper.
- Soft-delete via TypeORM's `@DeleteDateColumn`. `repository.softRemove(entity)`. Never hard-delete domain rows.
- Tests: every service gets unit tests; every controller gets a supertest E2E. Run `yarn test`, `yarn lint`, and `yarn tsc --noEmit` (or `npx tsc --noEmit`) before declaring a task done — all three must be clean.

## 5. Frontend conventions

- Vue 3 `<script setup lang="ts">` only. No Options API in new code.
- API calls go through the typed clients in `src/api/<resource>.ts` — never call axios directly from a view.
- Cross-view state goes in Pinia (`src/stores/<resource>.ts`). Component-local UI state stays in the component.
- Auth gating is route-meta driven: `meta: { public: true }` on truly public routes; everything else requires auth. The global guard is in `src/router/guards.ts` — do not hard-code allowlists.
- PrimeVue Toast (`useToast`) and ConfirmDialog (`useConfirm`) are registered globally in `main.ts` and mounted in `App.vue`. Reuse them; do not roll your own modal/toast components.
- Markdown rendering uses `md-editor-v3` (editor + `MdPreview`). CSS is imported once in `main.ts`.
- Run `yarn type-check` and `yarn build` before declaring a UI task done. Both must be clean.

## 6. Database & migrations

- Local Postgres lives in Docker (`docker compose up -d postgres`). Connection string in `backend/.env`.
- Schema changes go through TypeORM migrations: `yarn migration:generate -- ./src/migrations/<Name>` then **review and edit** the generated SQL before running `yarn migration:run`. The generator often misses indexes (e.g. `GIN`) and `created_at DESC`-ordered composite indexes — add them by hand.
- Every migration must have a working `down()`. Spot-check it mentally before commit.
- Verify post-migration state via `docker exec lab10-capstone-proj-postgres-1 psql -U postgres -d skillplatform -c "\d <table>"`.

## 7. Secrets & environment

- `.env` is gitignored. `.env.example` lists every variable with placeholder values. If you add an env var, update `.env.example` in the same commit.
- Never commit real Google OAuth client secrets, JWT private keys, or any `.pem` file. `*.pem` is gitignored in `backend/`.
- Multiline values (RS256 keys) are stored with `\n` escapes in `.env` and decoded at boot — don't paste raw newlines.

## 8. Communication & scope

- Keep changes scoped to the task at hand. Don't refactor unrelated code "while we're here."
- Don't add features beyond what the task asks. Don't introduce abstractions for hypothetical future requirements.
- Don't write comments that restate what well-named code already says. Only comment the *why* when it is non-obvious.
- Never run destructive operations (`rm -rf`, `git reset --hard`, `git push --force`, `terraform destroy`, `DROP TABLE`) without explicit confirmation in the same session.
- When in doubt, read the OpenSpec for the capability before guessing.
