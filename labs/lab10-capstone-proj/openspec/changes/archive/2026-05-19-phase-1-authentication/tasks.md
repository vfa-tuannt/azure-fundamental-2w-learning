## 1. Backend — Dependencies and Environment

- [x] 1.1 Install backend packages: `@nestjs/passport`, `@nestjs/jwt`, `passport`, `passport-google-oauth20`, `passport-jwt`, `@types/passport-google-oauth20`, `@types/passport-jwt`, `uuid`
- [x] 1.2 Generate local RS256 key pair: `openssl genrsa -out jwt-private.pem 2048 && openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem` (save outside the repo or add `*.pem` to `.gitignore`)
- [x] 1.3 Update `backend/.env.example` to include `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback`, `FRONTEND_URL=http://localhost:5173`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` placeholders
- [x] 1.4 Add the generated PEM keys (with `\n` escapes for multiline) into local `backend/.env`
- [x] 1.5 Create Google Cloud OAuth client (Web application) with authorized redirect URI `http://localhost:3000/auth/google/callback`; paste client id/secret into local `.env`

## 2. Backend — Users Module and Migration

- [x] 2.1 Create `User` entity at `backend/src/users/user.entity.ts` with columns `id` (uuid PK), `email` (unique, not null), `name`, `avatarUrl` (nullable), `createdAt`
- [x] 2.2 Add a `UsersService` with `findByEmail(email)` and `upsertFromGoogleProfile({ email, name, avatarUrl })` methods
- [x] 2.3 Create `UsersModule` exporting `UsersService` and the TypeORM repository
- [x] 2.4 Configure TypeORM migrations: add `migration:generate` and `migration:run` yarn scripts; create `data-source.ts` for the CLI
- [x] 2.5 Generate migration `CreateUsersTable`; verify it adds `users` table with the unique constraint on `email`
- [x] 2.6 Run `yarn migration:run` against the local Docker Compose Postgres and confirm the table exists via pgAdmin

## 3. Backend — Auth Module (Google Strategy)

- [x] 3.1 Create `AuthModule` at `backend/src/auth/auth.module.ts` importing `PassportModule`, `JwtModule.registerAsync` (RS256 from env), and `UsersModule`
- [x] 3.2 Implement `GoogleStrategy` extending `PassportStrategy(Strategy, 'google')` with `clientID`, `clientSecret`, `callbackURL`, scope `['email', 'profile']`
- [x] 3.3 In `GoogleStrategy.validate()`: extract primary email from profile; throw `ForbiddenException` if not ending in `@vitalify.asia`; otherwise upsert via `UsersService` and return the user
- [x] 3.4 Implement `JwtStrategy` extending `PassportStrategy(Strategy, 'jwt')` with `ExtractJwt.fromAuthHeaderAsBearerToken()`, `algorithms: ['RS256']`, public key from env
- [x] 3.5 In `JwtStrategy.validate(payload)`: load the user via `UsersService.findById(payload.sub)` and return it
- [x] 3.6 Create `JwtAuthGuard` extending `AuthGuard('jwt')` and export it from `AuthModule`

## 4. Backend — Auth Controller

- [x] 4.1 Create `AuthController` at `backend/src/auth/auth.controller.ts`
- [x] 4.2 Add `GET /auth/google` decorated with `@UseGuards(AuthGuard('google'))` — empty handler (Passport handles the redirect)
- [x] 4.3 Add `GET /auth/google/callback` decorated with `@UseGuards(AuthGuard('google'))`: receive `req.user`, sign a JWT (RS256, 7 days, payload `{ sub, email, name, picture }`), redirect to `${FRONTEND_URL}/auth/callback?token=<jwt>`
- [x] 4.4 Add an exception filter (or local `try`/`catch` wrapper) that catches `ForbiddenException` from the Google strategy and redirects to `${FRONTEND_URL}/login?error=domain`
- [x] 4.5 Add `GET /auth/me` protected by `JwtAuthGuard`: return `{ id, email, name, avatarUrl }` from `req.user`
- [x] 4.6 Add `POST /auth/logout` returning `{ success: true }` (no guard required; idempotent)
- [x] 4.7 Register `AuthModule` in `AppModule`

## 5. Backend — Tests and Verification

- [x] 5.1 Unit test: `GoogleStrategy.validate` with a non-vitalify email throws `ForbiddenException`
- [x] 5.2 Unit test: `GoogleStrategy.validate` with a vitalify email returns the upserted user
- [x] 5.3 E2E or controller test: `GET /auth/me` returns 401 without token, 200 with valid token
- [x] 5.4 Run `yarn lint`, `yarn test`, and `yarn tsc --noEmit` — all clean

## 6. Frontend — Dependencies and Types

- [x] 6.1 Define TypeScript interface `User { id: string; email: string; name: string; avatarUrl: string | null }` in `frontend/src/api/types.ts`

## 7. Frontend — Auth Store and Axios Interceptors

- [x] 7.1 Create `frontend/src/stores/auth.ts` with Pinia store: state `{ user: User|null, token: string|null }`, getter `isAuthenticated`, actions `login()`, `logout()`, `fetchMe()`, `setToken(token)`
- [x] 7.2 In `setToken`, also write to `localStorage` under key `auth_token`; in `logout`, remove the key and push to `/login`
- [x] 7.3 On store init, read `auth_token` from `localStorage`; if present, call `fetchMe()` and `logout()` on failure
- [x] 7.4 Update `frontend/src/api/axios.ts`: add request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`
- [x] 7.5 Add response interceptor that, on HTTP 401, invokes the auth store's `logout()` action

## 8. Frontend — Routing and Guards

- [x] 8.1 Add a new route `/auth/callback` mapped to `AuthCallbackView.vue` in `frontend/src/router/index.ts`
- [x] 8.2 Create `frontend/src/router/guards.ts` exporting a `beforeEach` guard: allowlist `/login` and `/auth/callback`; all other routes require `authStore.isAuthenticated`; unauthenticated → redirect to `/login`
- [x] 8.3 Register the guard in `frontend/src/router/index.ts` via `router.beforeEach(authGuard)`

## 9. Frontend — Views

- [x] 9.1 Create `frontend/src/views/AuthCallbackView.vue`: on mount, read `token` from `route.query`, call `authStore.setToken(token)`, `router.replace('/auth/callback')`, `await authStore.fetchMe()`, then `router.replace('/challenges')`; if no token, redirect to `/login?error=missing_token`
- [x] 9.2 Update `frontend/src/views/LoginView.vue`: bind the "Sign in with Google" button click to `authStore.login()`; read `route.query.error` and show a domain-restriction message when `error=domain`
- [x] 9.3 Update `frontend/src/layouts/AppLayout.vue`: replace static avatar with reactive `authStore.user.avatarUrl` (fallback to initials) and display the user's name beside it
- [x] 9.4 Add a logout menu/button in the navbar (e.g. PrimeVue `Menu` or simple `Button` with `pi-sign-out` icon) wired to `authStore.logout()`

## 10. Frontend — Verification

- [x] 10.1 Run `yarn build` (typecheck + bundle) and confirm exit 0
- [x] 10.2 In a browser: navigate to `/challenges` while logged out → confirm redirect to `/login`
- [x] 10.3 In a browser: click "Sign in with Google" → complete OAuth with a `@vitalify.asia` account → confirm landing on `/challenges` with name + avatar shown in the navbar
- [x] 10.4 In a browser: attempt OAuth with a non-vitalify account → confirm landing on `/login?error=domain` with the friendly error message
- [x] 10.5 In a browser: click logout → confirm redirect to `/login` and that `/challenges` is again gated
- [x] 10.6 In a browser: refresh the page after sign-in → confirm session persists (token in `localStorage`, user re-hydrated from `GET /auth/me`)
