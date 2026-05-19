## Why

The Skill Challenge Platform is restricted to Vitalify employees. Phase 1 introduces Google OAuth-based authentication with a hard `@vitalify.asia` domain restriction, so every subsequent feature (challenges, enrollments, submissions, reviews) can identify the acting user and enforce ownership rules.

## What Changes

- Add a `users` table (`id`, `email UNIQUE`, `name`, `avatar_url`, `created_at`) with a TypeORM migration
- Add backend auth endpoints: `GET /auth/google` (initiate OAuth), `GET /auth/google/callback` (handle Google response), `GET /auth/me` (current user), `POST /auth/logout` (client-driven token revocation)
- Wire `passport-google-oauth20` strategy with a `@vitalify.asia` domain check; reject other domains with HTTP 403
- Sign JWTs with RS256 (7-day expiry); payload `{ sub, email, name, picture }`
- Add a reusable `JwtAuthGuard` for all future protected routes
- Add a Pinia `authStore` (state: `user`, `token`, `isAuthenticated`; actions: `login`, `logout`, `fetchMe`) with `localStorage` persistence
- Add an Axios request interceptor that attaches `Authorization: Bearer <jwt>` and a response interceptor that clears the token on 401
- Add Vue Router navigation guard: all routes except `/login` and `/auth/callback` require authentication; unauthenticated visitors are redirected to `/login`
- Update the login page (`/login`) and navbar to wire the real OAuth flow and display the authenticated user's avatar + name with a logout action
- Add a new `/auth/callback` route on the frontend to receive the JWT from the backend redirect and store it

## Capabilities

### New Capabilities
- `backend-auth`: Google OAuth login, JWT issuance, domain restriction, `users` persistence, and `JwtAuthGuard`
- `frontend-auth`: Login page, Pinia auth store, Axios auth interceptor, route guards, and authenticated navbar state

### Modified Capabilities
- `frontend-scaffold`: the login page transitions from a placeholder button to a real `GET /auth/google` initiator, and the navbar avatar becomes data-driven (user picture + name + logout)

## Impact

- **Backend**: new modules `auth/`, `users/`; new entity `User`; new env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `FRONTEND_URL`; new dependencies `@nestjs/passport`, `@nestjs/jwt`, `passport`, `passport-google-oauth20`, `passport-jwt`, `@types/passport-google-oauth20`, `@types/passport-jwt`
- **Frontend**: new files `src/stores/auth.ts`, `src/router/guards.ts`, `src/views/AuthCallbackView.vue`; updates to `src/api/axios.ts`, `src/router/index.ts`, `src/views/LoginView.vue`, `src/layouts/AppLayout.vue`
- **Database**: new `users` table created via TypeORM migration; first persistent schema in the project
- **Security**: secrets must be loaded from `.env` only; `.env.example` is updated; RS256 key pair generated locally (not committed)
- **No breaking changes** for already-implemented features — Phase 0 scaffold continues to work; routes simply gain a guard
