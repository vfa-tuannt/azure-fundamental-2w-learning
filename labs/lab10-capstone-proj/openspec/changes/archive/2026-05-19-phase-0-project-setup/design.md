## Context

The project has partially-scaffolded NestJS (backend) and Vue 3 (frontend) directories. Neither is connected to a database, has a health endpoint, enforces CORS, nor is wired to local infrastructure. Phase 0 completes the scaffold so every subsequent feature phase has a runnable, CI-validated starting point.

Current state:
- `backend/`: bare NestJS init (no TypeORM, no env config, no health route, no CORS)
- `frontend/`: Vue 3 + Pinia + Vue Router init (no PrimeVue, no Axios, no base layout)
- No `docker-compose.yml` at the repo root
- No GitHub Actions CI

## Goals / Non-Goals

**Goals:**
- Backend runnable via `yarn start:dev` with a Postgres connection from `.env`
- `GET /health` returns `{ status: "ok" }` with HTTP 200
- CORS allows `http://localhost:5173` in dev; overridable via `CORS_ORIGIN` env var
- `yarn lint` and `yarn test` pass on CI (GitHub Actions)
- Frontend renders base layout (navbar, sidebar, content) and all 5 routes navigate without errors
- `yarn build` succeeds with no TypeScript errors
- Docker Compose starts Postgres 16, pgAdmin, and Azurite with a single `docker-compose up -d`

**Non-Goals:**
- No authentication logic (Phase 1)
- No database migrations or entity definitions beyond confirming TypeORM connects
- No PrimeVue component usage beyond layout primitives
- No E2E tests (unit test scaffold only)

## Decisions

**D1 — TypeORM data source from `DATABASE_URL`**
Use a single `DATABASE_URL` env var (Postgres connection string) instead of separate host/port/user vars. Rationale: simpler `.env.example`, consistent with Heroku/Railway conventions, and directly usable with most Postgres clients.

**D2 — ConfigModule for env injection**
Use `@nestjs/config` `ConfigModule.forRoot()` with `isGlobal: true` so `DATABASE_URL` and `CORS_ORIGIN` are available across all modules without repeated imports. Alternative (manual `process.env`) is brittle and untestable.

**D3 — CORS_ORIGIN env var for cross-env support**
CORS origin defaults to `http://localhost:5173` if `CORS_ORIGIN` is not set. In production (Phase 7) the App Service app setting overrides it. No code change needed between environments.

**D4 — PrimeVue Lara theme via `@primevue/themes`**
Install PrimeVue 4 with the Lara preset via `createApp().use(PrimeVue, { theme: { preset: Lara } })`. The Lara theme is bundled in `@primevue/themes` and requires no separate CSS import, keeping the setup simple.

**D5 — Axios base URL from `VITE_API_URL`**
Create a single `src/api/axios.ts` instance with `baseURL: import.meta.env.VITE_API_URL`. All API calls in later phases import this instance. Alternative (inline `axios.create` per component) would scatter config.

**D6 — GitHub Actions matrix**
Single `ci.yml` workflow triggers on push and PR to `main`. Jobs: `backend` (lint + test) and `frontend` (typecheck + build). Both jobs run on `ubuntu-latest` with Node 24. Postgres service container used for backend tests if needed.

**D7 — Tailwind CSS v4 + `tailwindcss-primeui`**
Use Tailwind v4 via the official `@tailwindcss/vite` plugin (CSS-first config, no `tailwind.config.js`). The CSS entry imports `tailwindcss` and registers the `tailwindcss-primeui` plugin so PrimeVue tokens (e.g. `primary-50`, `primary-700`) are available as Tailwind utilities. Rationale: scoped CSS in every component duplicates styling decisions, while Tailwind utility classes plus PrimeVue's design tokens keep the layout responsive and on-brand without a custom design system. Alternative (PrimeFlex) is being deprecated by the PrimeTek team in favor of Tailwind.

**D8 — Mobile-first responsive shell**
The base layout uses a single breakpoint (`md` = 768px) to flip between mobile and desktop nav:
- `< md`: hamburger button in the navbar opens a left-side `<Drawer>` containing the nav items
- `≥ md`: sidebar is rendered inline as a fixed 240px-wide left column; hamburger is hidden
Content uses `min-h-dvh` (dynamic viewport) and `max-w-6xl` content container. Rationale: a single breakpoint keeps logic simple while satisfying mobile-first; `dvh` avoids the iOS Safari 100vh address-bar bug. Alternative (multiple breakpoints with grid) adds complexity for negligible UX benefit at this stage.

**D9 — Remove Vue starter assets**
The Vue starter ships `HomeView.vue`, `AboutView.vue`, `HelloWorld.vue`, `TheWelcome.vue`, plus `base.css` containing a `@media (min-width: 1024px)` rule that turns `#app` into a 2-column grid — this was the root cause of the broken desktop view in the first scaffold. All starter components, views, and CSS are removed; `main.css` is reduced to a Tailwind import and a minimal `body`/`#app` base layer.

## Risks / Trade-offs

- [TypeORM connection failure at startup] → If `DATABASE_URL` is missing or wrong, the app crashes on boot. Mitigation: document `.env.example`; CI does not require a live DB for the lint/test job.
- [PrimeVue tree-shaking with Vite] → PrimeVue 4 auto-import plugin may conflict with manual component registration. Mitigation: use `@primevue/auto-import-resolver` with `unplugin-vue-components` or register globally in `main.ts`.
- [Vue Router 4 vs 5 API differences] → `package.json` shows `vue-router ^5.0.4` which is the Vue Router 4 stable API with a bumped major. Confirm import syntax (`createRouter`, `createWebHistory`) works as expected.
- [Tailwind v4 + PrimeVue CSS layer ordering] → PrimeVue ships its own CSS-in-JS styles; Tailwind utilities and PrimeVue passthrough may collide on z-index or padding. Mitigation: use Tailwind for layout/spacing only and rely on PrimeVue's own theming for component internals (e.g. `Drawer`, `Menubar`, `Button`).
