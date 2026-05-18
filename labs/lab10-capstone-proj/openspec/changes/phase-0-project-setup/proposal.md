## Why

The Skill Challenge Platform needs a solid local development foundation before any feature work begins. Phase 0 establishes the scaffolded NestJS backend and Vue 3 frontend, wired to local infrastructure via Docker Compose, so all subsequent phases can build on a verified, CI-passing baseline.

## What Changes

- Initialize NestJS project with TypeScript, TypeORM, and Postgres connection via `DATABASE_URL`
- Add `docker-compose.yml` running Postgres 16, pgAdmin, and Azurite (blob emulator)
- Expose `GET /health` endpoint returning `{ status: "ok" }` with CORS configured for local dev
- Add GitHub Actions CI running lint and tests on every push
- Initialize Vue 3 (Vite) project with TypeScript, PrimeVue (Lara theme), Pinia, and Vue Router
- Add Tailwind CSS v4 (via `@tailwindcss/vite`) with `tailwindcss-primeui` plugin for shared design tokens
- Implement mobile-first base layout: top navbar, mobile drawer / desktop fixed sidebar (≥ md breakpoint), main content area
- Define frontend routes: `/`, `/login`, `/challenges`, `/challenges/:id`, `/me`
- Configure Axios instance with `VITE_API_URL` base URL

## Capabilities

### New Capabilities
- `backend-scaffold`: NestJS app with TypeORM/Postgres config, health endpoint, CORS, ESLint, CI
- `frontend-scaffold`: Vue 3 app with PrimeVue layout, routing, Axios, and base UI structure
- `local-infra`: Docker Compose stack for Postgres 16, pgAdmin, and Azurite

### Modified Capabilities
<!-- None — this is the initial project setup with no existing specs to change -->

## Impact

- Creates `backend/` and `frontend/` project directories (already partially scaffolded)
- Adds `docker-compose.yml` at root
- Adds `.github/workflows/ci.yml` for GitHub Actions
- No breaking changes — this is the initial scaffold
- All subsequent phases depend on this foundation being in place
