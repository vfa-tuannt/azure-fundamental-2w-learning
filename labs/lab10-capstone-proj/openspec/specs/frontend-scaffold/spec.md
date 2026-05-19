# Frontend Scaffold Specification

## Purpose

Defines the foundational frontend scaffolding requirements: Vue 3 + PrimeVue + Tailwind responsive shell, mobile-first navigation, routing, Axios configuration, and build verification.

## Requirements

### Requirement: PrimeVue base layout
The system SHALL render a persistent application shell consisting of a top navbar (containing logo on the left and profile avatar on the right) and a main content area. Navigation SHALL be presented through PrimeVue components (`Avatar`, `Button`, `Drawer`) and the layout SHALL be present on all routes except `/login`.

#### Scenario: Layout renders on authenticated routes
- **WHEN** a user navigates to any route other than `/login`
- **THEN** the top navbar with logo (left) and avatar (right) plus the main content area are visible

#### Scenario: Login page is layout-free
- **WHEN** a user navigates to `/login`
- **THEN** only the login page content is shown without navbar or sidebar

### Requirement: Mobile-first responsive navigation
The system SHALL adapt its primary navigation to the viewport width using the `md` breakpoint (≥ 768px):
- Below `md`: the sidebar SHALL be hidden by default and SHALL open as a left-side `<Drawer>` when the navbar's hamburger button is tapped.
- At or above `md`: the sidebar SHALL be rendered inline as a fixed left column, and the hamburger button SHALL be hidden.

#### Scenario: Mobile drawer opens via hamburger
- **WHEN** the viewport is below 768px and the user taps the hamburger button in the navbar
- **THEN** a left-side drawer opens containing the navigation items

#### Scenario: Desktop sidebar is always visible
- **WHEN** the viewport is at or above 768px
- **THEN** the sidebar is visible inline as a left column and the hamburger button is not rendered

#### Scenario: No horizontal overflow on mobile
- **WHEN** the viewport is 375px wide (small phone)
- **THEN** no part of the layout overflows horizontally and no horizontal scroll appears

### Requirement: Tailwind CSS utility framework
The system SHALL use Tailwind CSS v4 (via `@tailwindcss/vite`) for layout, spacing, and responsive utilities. The CSS entry SHALL register the `tailwindcss-primeui` plugin so PrimeVue's design tokens (e.g. `primary-50`, `primary-700`) are available as Tailwind classes.

#### Scenario: Tailwind utilities are available in components
- **WHEN** a component uses a class such as `flex`, `md:hidden`, or `bg-primary-50`
- **THEN** the class compiles to working CSS in the production build

#### Scenario: PrimeVue tokens are exposed to Tailwind
- **WHEN** a component uses a class such as `text-primary-700` or `bg-primary-50`
- **THEN** the color resolves to the PrimeVue Lara primary palette at runtime

### Requirement: Application routing
The system SHALL define the following client-side routes using Vue Router: `/` (home/redirect), `/login`, `/auth/callback`, `/challenges`, `/challenges/:id`, `/me`. Navigation between routes SHALL work without a full-page reload.

#### Scenario: Route navigation without reload
- **WHEN** a user clicks a navigation link to `/challenges`
- **THEN** the URL updates and the challenges view renders without a page reload

#### Scenario: Unknown route handling
- **WHEN** a user navigates to an undefined route
- **THEN** they are redirected to `/` or shown a 404 view

#### Scenario: Auth callback route is reachable without authentication
- **WHEN** an unauthenticated user navigates to `/auth/callback?token=<jwt>`
- **THEN** the route renders the `AuthCallbackView` component without being intercepted by the auth guard

### Requirement: Axios API client configuration
The system SHALL provide a pre-configured Axios instance with `baseURL` set from the `VITE_API_URL` environment variable. All API calls in the application SHALL use this shared instance. The instance SHALL include a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage` when present, and a response interceptor that clears the session and redirects to `/login` on HTTP 401.

#### Scenario: API base URL from env
- **WHEN** `VITE_API_URL` is set to `http://localhost:3000`
- **THEN** all Axios requests are sent relative to that base URL

#### Scenario: Authorization header attached when token present
- **WHEN** an Axios request is sent and a JWT exists in `localStorage` under the `auth_token` key
- **THEN** the outgoing request includes header `Authorization: Bearer <token>`

#### Scenario: 401 response clears session
- **WHEN** any Axios response returns HTTP 401
- **THEN** the response interceptor clears the stored token and routes the user to `/login`

### Requirement: Build succeeds with no TypeScript errors
The system SHALL produce a production build (`yarn build`) that completes successfully with no TypeScript compilation errors.

#### Scenario: Clean build
- **WHEN** `yarn build` is executed on a fresh checkout with dependencies installed
- **THEN** the build completes with exit code 0 and outputs to `dist/`

#### Scenario: Typecheck passes
- **WHEN** `vue-tsc --build` is run against the frontend source
- **THEN** no TypeScript errors are reported

### Requirement: Browser verification of layout and routes
The system SHALL render the base layout correctly in a browser and all defined routes SHALL be navigable without JavaScript console errors.

#### Scenario: Layout visible in browser
- **WHEN** the dev server is running and a developer opens `http://localhost:5173`
- **THEN** the top navbar, sidebar, and content area are visible with no console errors

#### Scenario: All routes accessible
- **WHEN** a developer navigates to `/challenges`, `/me`, and `/login`
- **THEN** each route renders its corresponding view without errors
