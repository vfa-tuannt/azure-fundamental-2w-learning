## Context

Phase 0 delivered a working NestJS backend with Postgres + TypeORM and a Vue 3 + Tailwind frontend with PrimeVue. There is no user identity yet — every endpoint is anonymous, the login page is a placeholder, and routes are unguarded. Phase 1 adds the first real domain: identifying a Vitalify employee via Google OAuth and using their identity to gate access to the rest of the application.

Constraints from the PRD:
- Only `@vitalify.asia` Google Workspace accounts may sign in
- JWT must be RS256 with a 7-day expiry
- Auth must be reusable: every subsequent phase (challenges, enrollments, submissions) needs the same guard
- Stack is fixed: `passport-google-oauth20`, `@nestjs/jwt`, Pinia for FE state

## Goals / Non-Goals

**Goals:**
- A user can click "Sign in with Google" on `/login`, complete the consent screen, and land back in the app authenticated
- Non-`@vitalify.asia` accounts are rejected with a clear error (HTTP 403 server-side, friendly toast/redirect client-side)
- JWT travels in `Authorization: Bearer <token>` headers; backend validates with a single reusable `JwtAuthGuard`
- Logging out clears the token client-side and immediately blocks access to protected routes
- The navbar reflects auth state (avatar + name when signed in)

**Non-Goals:**
- No refresh tokens or rotating credentials (7-day JWT is sufficient for v1)
- No server-side session store or token blacklist (logout is purely client-side)
- No 2FA or magic-link fallback
- No Entra External ID — direct Google OAuth via `passport-google-oauth20` per PRD §12
- No role/permission system yet (every authenticated Vitalify user has identical privileges in Phase 1)

## Decisions

**D1 — Server-initiated OAuth redirect (not client-side popup)**
The `/login` button performs a full-page navigation to `GET /auth/google` on the backend, which uses Passport to redirect to Google. Google redirects back to `GET /auth/google/callback`, which exchanges the code, issues a JWT, then 302-redirects the browser to `${FRONTEND_URL}/auth/callback?token=<jwt>`. The frontend's `AuthCallbackView` reads the token from the URL, stores it, and replaces the URL.

Rationale: Avoids Google's restrictions on third-party popups, keeps the client secret server-side, and works identically in production behind APIM in Phase 7. Alternative (Google Identity Services client SDK) would mix client + server credentials and complicate the Phase 7 APIM proxy.

**D2 — RS256 with PEM key pair loaded from env**
JWTs are signed with an RS256 private key and verified with the public key. Both are loaded from env vars `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (multiline values stored with `\n` escapes in `.env`, decoded on boot). Locally, the developer runs `openssl genrsa` / `openssl rsa -pubout` once and pastes the keys into `.env`.

Rationale: Asymmetric keys make it trivial in Phase 7 to share the public key with APIM (for the `validate-jwt` policy) without exposing the signing key. Alternative (HS256 shared secret) would force APIM to hold the same secret as the backend, increasing blast radius.

**D3 — Domain restriction inside the Passport validate callback**
The `GoogleStrategy.validate()` method receives the Google profile and explicitly checks `profile.emails[0].value.endsWith('@vitalify.asia')`. If false, it throws `ForbiddenException`. The auth controller catches this and redirects to `${FRONTEND_URL}/login?error=domain` so the user sees a friendly message.

Rationale: Enforced at the earliest possible point (before user upsert, before JWT issuance). Alternative (filter in controller) would require unwinding partial state if the check fails late.

**D4 — `users` table is the persistence root for identity**
The TypeORM `User` entity has columns: `id` (uuid, primary), `email` (varchar, unique not null), `name` (varchar), `avatar_url` (varchar nullable), `created_at` (timestamptz default now()). All future tables (`challenges.owner_id`, `enrollments.user_id`, etc.) will FK to `users.id`.

Rationale: Storing the user once at OAuth callback and FK'ing from everywhere else is cleaner than denormalizing email/name into each table. The migration is the first real schema migration in the project — it establishes the migration workflow for Phase 2+.

**D5 — Pinia `authStore` with `localStorage` persistence**
The store holds `user`, `token`, and `isAuthenticated`. On mount it reads `token` from `localStorage`; if present, it calls `GET /auth/me` to hydrate `user`. `login()` simply navigates to `GET /auth/google` (the OAuth callback handles persistence). `logout()` clears both the store and `localStorage`, then pushes to `/login`.

Rationale: `localStorage` is the simplest persistent client store and works without cookies (no CSRF concerns for our same-origin/JWT pattern). Alternative (httpOnly cookies) is more secure against XSS but requires CSRF protection and complicates the APIM proxy in Phase 7.

**D6 — Axios interceptors centralize auth concerns**
A request interceptor reads `token` from `localStorage` (single source of truth) and sets `Authorization: Bearer <token>` on every outgoing request. A response interceptor catches HTTP 401 and triggers `authStore.logout()` (which also redirects to `/login`). Phase 1+ feature code does not need to think about auth headers.

Rationale: Keeps protected-route fetching idiomatic (no per-call header). Alternative (manual header per call) is error-prone and duplicates logic.

**D7 — Vue Router `beforeEach` global guard**
A single navigation guard runs on every route change. It allowlists `/login` and `/auth/callback`; everything else requires `authStore.isAuthenticated === true`. If not authenticated, it redirects to `/login`.

Rationale: One file, one rule. Per-route `meta.requiresAuth` flags scatter the policy. Default-deny is safer than default-allow.

## Risks / Trade-offs

- [JWT in `localStorage` is vulnerable to XSS] → Mitigation: keep the app strictly free of `v-html` on untrusted content; rely on Vue's default escaping. Acceptable trade-off vs. cookie-based flow complexity for this internal tool.
- [RS256 private key in `.env`] → Mitigation: `.env` is gitignored; production (Phase 7) reads the key from Key Vault via Managed Identity. `.env.example` shows the format but no real key.
- [No refresh tokens — user must re-login every 7 days] → Mitigation: 7-day window aligns with PRD; refresh-token rotation can be added later if real usage data shows friction.
- [Domain check is one line in the strategy — easy to miss in code review] → Mitigation: add a unit test that asserts a non-`@vitalify.asia` profile triggers `ForbiddenException`.
- [`GET /auth/google/callback` exposes the JWT in the URL of the redirect to the frontend] → The URL fragment / query is only visible to the user's own browser history and the frontend itself, but the token will appear in browser history. Mitigation: the `AuthCallbackView` uses `router.replace()` to remove the token from the URL bar within one tick. Future hardening (Phase 7): switch to `httpOnly` cookie issued by the backend on the same domain.
