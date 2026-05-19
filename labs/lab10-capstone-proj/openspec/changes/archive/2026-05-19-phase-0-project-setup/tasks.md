## 1. Local Infrastructure

- [x] 1.1 Create `docker-compose.yml` at repo root with `postgres:16`, `dpage/pgadmin4`, and `mcr.microsoft.com/azure-storage/azurite` services
- [x] 1.2 Configure named Docker volume for Postgres data persistence
- [x] 1.3 Set Postgres credentials to match `.env.example` defaults (`postgres`/`postgres`, db `skillplatform`)
- [x] 1.4 Expose ports: Postgres 5432, pgAdmin 5050, Azurite 10000/10001/10002
- [x] 1.5 Verify `docker-compose up -d` starts all three services without errors

## 2. Backend — Dependencies and Configuration

- [x] 2.1 Install `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg` packages
- [x] 2.2 Add `ConfigModule.forRoot({ isGlobal: true })` to `AppModule`
- [x] 2.3 Add `TypeOrmModule.forRootAsync()` reading `DATABASE_URL` via `ConfigService`
- [x] 2.4 Create `.env.example` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/skillplatform` and `CORS_ORIGIN=http://localhost:5173`
- [x] 2.5 Add `.env` to `.gitignore`
- [x] 2.6 Copy `.env.example` to `.env` locally

## 3. Backend — Health Endpoint and CORS

- [x] 3.1 Add `GET /health` route to `AppController` returning `{ status: 'ok' }` with HTTP 200
- [x] 3.2 Enable CORS in `main.ts` with origin from `process.env.CORS_ORIGIN ?? 'http://localhost:5173'`
- [x] 3.3 Verify `curl http://localhost:3000/health` returns `{ "status": "ok" }` after `yarn start:dev`

## 4. Backend — Linting and Tests

- [x] 4.1 Confirm ESLint flat config (`eslint.config.mjs`) covers `src/**/*.ts` and `test/**/*.ts`
- [x] 4.2 Run `yarn lint` and fix any existing lint errors
- [x] 4.3 Run `yarn test` and confirm the default AppController spec passes
- [x] 4.4 Run typecheck (`yarn tsc --noEmit`) and fix any type errors

## 5. Frontend — PrimeVue and Axios Setup

- [x] 5.1 Install `primevue`, `@primevue/themes`, `primeicons`, `axios` packages
- [x] 5.2 Register PrimeVue in `main.ts` with Lara theme preset: `app.use(PrimeVue, { theme: { preset: Lara } })`
- [x] 5.3 Import `primeicons/primeicons.css` in `main.ts`
- [x] 5.4 Create `src/api/axios.ts` exporting an Axios instance with `baseURL: import.meta.env.VITE_API_URL`
- [x] 5.5 Create `.env` (and `.env.example`) with `VITE_API_URL=http://localhost:3000`

## 6. Frontend — Base Layout

- [x] 6.1 Create `src/layouts/AppLayout.vue` with top navbar (logo + hamburger + avatar via PrimeVue `Button` and `Avatar`), responsive sidebar (`<Drawer>` on mobile, inline column ≥ md), and main content `<router-view>`
- [x] 6.2 Add logo text/placeholder in navbar left slot and avatar placeholder in right slot
- [x] 6.3 Apply layout to all routes except `/login` via a layout wrapper in the router or a conditional in `App.vue`
- [x] 6.4 Install Tailwind CSS v4 (`@tailwindcss/vite`) and `tailwindcss-primeui`; register the Vite plugin in `vite.config.ts`
- [x] 6.5 Replace `src/assets/main.css` with a Tailwind import + `tailwindcss-primeui` plugin directive and remove the conflicting `base.css` (Vue starter grid)
- [x] 6.6 Remove unused Vue starter components and views (`HelloWorld`, `TheWelcome`, `WelcomeItem`, `icons/`, `HomeView`, `AboutView`)
- [x] 6.7 Style views (`ChallengesView`, `ChallengeDetailView`, `MeView`, `LoginView`) with Tailwind utilities and verify no horizontal overflow at 375px viewport

## 7. Frontend — Routing

- [x] 7.1 Define routes in `src/router/index.ts`: `/` (redirect to `/challenges`), `/login`, `/challenges`, `/challenges/:id`, `/me`
- [x] 7.2 Create stub view components: `HomeView.vue` (redirect), `LoginView.vue`, `ChallengesView.vue`, `ChallengeDetailView.vue`, `MeView.vue`
- [x] 7.3 Verify navigation between all routes works without page reload or console errors

## 8. Frontend — Build and Typecheck

- [x] 8.1 Run `yarn build` and confirm it exits 0 with no TypeScript errors
- [x] 8.2 Run `vue-tsc --build` (typecheck) and fix any type errors
- [x] 8.3 Open `http://localhost:5173` in browser and confirm layout renders, all 5 routes navigate correctly, and no console errors appear

## 9. CI — GitHub Actions

- [x] 9.1 Create `.github/workflows/ci.yml` with a `backend` job: checkout → Node 24 setup → `yarn install --frozen-lockfile` → `yarn lint` → `yarn test`
- [x] 9.2 Add a `frontend` job to the same workflow: checkout → Node 24 setup → `yarn install --frozen-lockfile` → `yarn type-check` → `yarn build`
- [x] 9.3 Set workflow trigger to `push` and `pull_request` on `main`
- [ ] 9.4 Push to `main` and verify both jobs pass in GitHub Actions
