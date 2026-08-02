# Authenticated Context and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded authenticated shell context with a server-mediated organisation/branch selection gate and backend-backed user profile.

**Architecture:** Better Auth remains the authentication boundary. Server-only backend helpers obtain the Keycloak access token, call the Spring API, and persist only the signed application context token in an HttpOnly cookie. A shell-free `/select-context` page drives organisation and branch selection through same-origin Next route handlers; the authenticated layout resolves `/auth/me` before rendering `AppShell`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Better Auth, Keycloak OIDC, MUI v9, Vitest/Testing Library, Playwright, Zod, Prettier, ESLint.

## Global Constraints

- Keep Keycloak access/refresh/ID tokens server-only; never pass them to Client Components or browser state.
- Use the existing Better Auth server session check; `proxy.ts` remains optimistic only.
- Use MUI for component visuals and Tailwind only for layout composition.
- Keep application context typed; do not introduce `any`, `@ts-ignore`, or disabled lint rules.
- Use paginated discovery requests with `page=0&size=25`.
- Send a fresh UUID `Idempotency-Key` on each selection mutation.
- Use safe, non-membership-revealing error copy and validate all redirect behavior.
- Run `pnpm check`, `pnpm test:e2e`, and `pnpm build` before declaring completion.

---

### Task 1: Add typed backend/context infrastructure

**Files:**

- Modify: `config/env.server.ts`
- Modify: `.env.example`
- Modify: `auth/auth.types.ts`
- Create: `auth/context.types.ts`
- Create: `auth/context-cookie.ts`
- Create: `auth/backend-api.ts`
- Test: `config/env.server.test.ts`
- Test: `auth/backend-api.test.ts`
- Test: `auth/context-cookie.test.ts`

**Interfaces:**

- `BackendProfile`, `BackendOrganisation`, `BackendBranch`, `Page<T>`, and selection response types in `auth/context.types.ts` model the snake_case backend boundary exactly.
- `backendApi.get(path, headers, contextToken?)` and `backendApi.post(path, body, headers, contextToken?)` return typed JSON or throw a typed `BackendApiError` containing only status and safe problem metadata.
- `readContextToken(headers?: Headers): Promise<string | null>`, `setContextToken(token)`, and `clearContextToken()` centralize the `finaxis_context` HttpOnly cookie.
- `getKeycloakAccessToken(headers: Headers): Promise<string>` obtains the current Better Auth Keycloak access token server-side.

- [ ] **Step 1: Write failing environment and cookie tests.**

  Assert that `FINAXIS_API_URL` is required and URL-shaped, that the cookie is HttpOnly/path `/`/same-site, and that production marks it secure while development does not.

- [ ] **Step 2: Run the focused tests and confirm they fail for missing infrastructure.**

  Run:

  ```bash
  pnpm test:run config/env.server.test.ts auth/context-cookie.test.ts
  ```

  Expected: failure naming the missing `FINAXIS_API_URL`, cookie helpers, or test fixtures.

- [ ] **Step 3: Write failing backend-client contract tests.**

  Mock `auth.api.getAccessToken`, `fetch`, and server environment values. Verify GET adds `Authorization: Bearer <accessToken>`, context requests add `X-Active-Organisation-Context`, POST selection requests add `Content-Type` and a valid UUID `Idempotency-Key`, and non-2xx responses become `BackendApiError` without exposing response bodies to callers.

- [ ] **Step 4: Implement the typed infrastructure.**

  Add `FINAXIS_API_URL` to the lazy server environment schema and `.env.example`. Implement `auth/context.types.ts` with exact backend fields, including `PageMetadata`, `BackendOrganisation`, `BackendBranch`, `SelectOrganisationResponse`, `SelectBranchResponse`, and `BackendUserProfile`. Implement the cookie helper with `cookies()` and the existing `serverEnv.NODE_ENV` policy. Implement `auth/backend-api.ts` so every request calls Better Auth server-side, uses the configured URL without a trailing-slash double path, parses JSON only on successful responses, and generates `crypto.randomUUID()` for mutation idempotency.

- [ ] **Step 5: Run focused tests and typecheck.**

  Run:

  ```bash
  pnpm test:run config/env.server.test.ts auth/backend-api.test.ts auth/context-cookie.test.ts
  pnpm typecheck
  ```

  Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the infrastructure slice.**

  ```bash
  git add config/env.server.ts .env.example auth/auth.types.ts auth/context.types.ts auth/context-cookie.ts auth/backend-api.ts config/env.server.test.ts auth/backend-api.test.ts auth/context-cookie.test.ts
  git commit -m "feat: add server-side context api client"
  ```

### Task 2: Add server route handlers for context discovery and selection

**Files:**

- Create: `app/api/context/organisations/route.ts`
- Create: `app/api/context/organisation/route.ts`
- Create: `app/api/context/branches/route.ts`
- Create: `app/api/context/branch/route.ts`
- Create: `auth/context-service.ts`
- Test: `app/api/context/context-routes.test.ts`

**Interfaces:**

- `discoverOrganisations(headers)` returns `Page<BackendOrganisation>`.
- `selectOrganisation(headers, organisationId)` returns `SelectOrganisationResponse` and writes the context cookie.
- `discoverBranches(headers)` reads the context cookie and returns `Page<BackendBranch>`.
- `selectBranch(headers, branchId)` returns `SelectBranchResponse` and replaces the context cookie.

- [ ] **Step 1: Write route-handler tests for authentication and discovery.**

  Mock the context service. Assert unauthenticated requests return `401`, `GET /api/context/organisations` forwards `page=0&size=25`, and `GET /api/context/branches` requires a context token without returning the token in JSON.

- [ ] **Step 2: Write route-handler tests for selection and safe errors.**

  Assert organisation and branch POST handlers reject missing/non-UUID IDs with `400`, call the service with the authenticated request headers, set the HttpOnly context cookie from the backend response, and map backend `401`/`403` into safe JSON messages. Assert stale context selection clears the cookie and returns `409` or `403` according to the established frontend error contract.

- [ ] **Step 3: Implement `auth/context-service.ts`.**

  Keep all backend endpoint paths in this server-only module. Use the backend client from Task 1, validate UUID inputs with Zod, pass the current request headers to Better Auth, and use the context cookie only for branch discovery and profile calls. Do not accept a client-supplied context token.

- [ ] **Step 4: Implement the four route handlers.**

  Use `headers()`/`cookies()` only inside server route handlers, return plain serializable JSON, and set or clear the context cookie through the centralized helper. Do not echo `context_token` to the browser response body; the browser needs only selection status and display data.

- [ ] **Step 5: Run the route tests.**

  ```bash
  pnpm test:run app/api/context/context-routes.test.ts
  pnpm typecheck
  ```

  Expected: all route tests pass with no type errors.

- [ ] **Step 6: Commit the route slice.**

  ```bash
  git add app/api/context auth/context-service.ts
  git commit -m "feat: add context discovery and selection routes"
  ```

### Task 3: Implement the shell-free context selection page

**Files:**

- Create: `app/select-context/page.tsx`
- Create: `components/context/context-selection-page.tsx`
- Create: `components/context/context-selection-page.test.tsx`
- Modify: `app/(authenticated)/layout.tsx`
- Test: `app/(authenticated)/layout.test.tsx`

**Interfaces:**

- `ContextSelectionPage({ organisations })` is a Client Component receiving only serializable organisation data.
- The page calls same-origin `/api/context/organisation`, `/api/context/branches`, and `/api/context/branch`; it never receives or stores a context token.
- `getSelectedContextProfile(headers)` returns either a typed resolved profile/context or a typed reason for redirect.

- [ ] **Step 1: Write component tests for the state machine.**

  Cover organisation loading/error/empty states, organisation selection loading and error, branch loading/error/empty states, auto-selected branch completion, explicit multi-branch selection, disabled controls while mutating, labelled controls, one `h1`, and safe error copy.

- [ ] **Step 2: Implement the client selection state machine.**

  Render a single MUI form surface with an organisation select first. After a successful organisation POST, load branches. If the response indicates an auto-selected branch, navigate to the requested destination; otherwise render the branch select. On branch success, navigate to the validated internal destination or `/profile`. Use `useRouter` only for fixed internal paths and do not trust arbitrary query redirects.

- [ ] **Step 3: Implement the server page.**

  Validate the Better Auth session with `auth.api.getSession`; redirect missing sessions to `/login?reason=session_expired`. Load the first organisation discovery page through the server context service and pass only safe organisation fields to the client component. Render the page outside `(authenticated)` so no shell is mounted.

- [ ] **Step 4: Add layout context resolution.**

  Replace `applicationContext` in `app/(authenticated)/layout.tsx` with `getSelectedContextProfile`. If the backend profile call has no valid context, redirect to `/select-context`. Derive `ApplicationContext` from backend organisation/selected branch fields and derive `FinaxisUser` from the backend profile while retaining the Better Auth session’s signed-in timestamp. Keep the defensive server-side session recheck.

- [ ] **Step 5: Update focused tests.**

  Mock route responses in the component tests. Update layout fixtures to provide resolved backend profile/context and add redirects for missing context. Confirm the shell never renders when context resolution fails.

- [ ] **Step 6: Run focused UI tests.**

  ```bash
  pnpm test:run components/context/context-selection-page.test.tsx app/'(authenticated)'/layout.test.tsx
  pnpm typecheck
  ```

  Expected: all selection and layout tests pass.

- [ ] **Step 7: Commit the pre-shell/UI slice.**

  ```bash
  git add app/select-context components/context 'app/(authenticated)/layout.tsx' 'app/(authenticated)/layout.test.tsx'
  git commit -m "feat: gate shell on organisation context"
  ```

### Task 4: Replace the profile fixture with the backend profile read model

**Files:**

- Modify: `auth/auth.types.ts`
- Modify: `auth/map-authenticated-user.ts`
- Modify: `app/(authenticated)/profile/page.tsx`
- Modify: `components/profile/profile-view.tsx`
- Test: `auth/map-authenticated-user.test.ts`
- Create: `app/(authenticated)/profile/page.test.tsx`
- Test: `components/profile/profile-view.test.tsx`

**Interfaces:**

- `mapBackendProfile(profile: BackendUserProfile): FinaxisUser` maps backend snake_case data into the existing sanitized DTO.
- `getSelectedContextProfile(headers)` is the sole profile/context read path for authenticated shell rendering.

- [ ] **Step 1: Add failing mapping tests.**

  Assert full name, email, organisation display name/id, selected branch, all assigned branches, role codes/names as the chosen display value, and permission preservation. Assert null organisation/branch and empty arrays retain the existing explicit empty states.

- [ ] **Step 2: Implement backend profile mapping.**

  Keep `keycloakSubject` out of the client DTO unless an existing display requirement needs it. Map `full_name` with a safe fallback to email, use `organisation.display_name`, use `selected_branch.name`, map `branches` from `branch_id`/`branch_name`, and map roles to stable role codes. Preserve readonly array types.

- [ ] **Step 3: Update the profile page and view tests.**

  Remove the duplicate Better Auth profile fetch from the profile page; consume the already-resolved sanitized user/profile data supplied by the authenticated layout or call the same server-only resolver without exposing raw session claims. Keep the defensive session check and signed-in timestamp. Update visible labels to use “Organisation” consistently while preserving accessibility.

- [ ] **Step 4: Run profile-focused tests.**

  ```bash
  pnpm test:run auth/map-authenticated-user.test.ts app/'(authenticated)'/profile/page.test.tsx components/profile/profile-view.test.tsx
  pnpm typecheck
  ```

  Expected: mapping, page, and component tests pass.

- [ ] **Step 5: Commit the profile slice.**

  ```bash
  git add auth/auth.types.ts auth/map-authenticated-user.ts 'app/(authenticated)/profile/page.tsx' 'app/(authenticated)/profile/page.test.tsx' components/profile/profile-view.tsx components/profile/profile-view.test.tsx auth/map-authenticated-user.test.ts
  git commit -m "feat: load profile from platform api"
  ```

### Task 5: Add authenticated end-to-end coverage and documentation

**Files:**

- Modify: `e2e/protected-routes.spec.ts`
- Modify: `e2e/keycloak-smoke.spec.ts`
- Create or modify: `e2e/context-selection.spec.ts`
- Modify: `README.md`
- Modify: `docs/authentication/architecture.md`
- Modify: `.env.example` if Task 1 changes require additional explanatory comments

- [ ] **Step 1: Add an e2e test for the pre-shell gate.**

  Mock the backend discovery and selection route handlers at the Next boundary. Start from an authenticated session, assert `/profile` redirects or renders `/select-context` without shell navigation, select an organisation, select a branch when required, and assert the shell header and backend profile values render after completion.

- [ ] **Step 2: Add failure-path e2e coverage.**

  Verify no organisations shows an actionable empty state, a selection `403` shows safe error text, and a stale context causes reselection rather than rendering the shell.

- [ ] **Step 3: Update protected-route expectations.**

  Preserve unauthenticated login redirects and adjust authenticated route assertions so they expect context selection before shell access. Keep `/login` independent of cookie presence.

- [ ] **Step 4: Document the new environment and flow.**

  Document `FINAXIS_API_URL`, the server-only backend proxy, the HttpOnly context cookie, and the `/select-context` pre-shell behavior. Remove the README statement that organisation/branch selection is unavailable and identify the hardcoded context fixture as removed.

- [ ] **Step 5: Run the complete frontend gates.**

  ```bash
  pnpm check
  pnpm test:e2e
  pnpm build
  ```

  Expected: all commands exit zero. If local Keycloak/backend availability blocks the live e2e configuration, run the mocked e2e suite and report the exact unavailable dependency separately; do not call the live flow verified without evidence.

- [ ] **Step 6: Commit the verification/documentation slice.**

  ```bash
  git add e2e README.md docs/authentication/architecture.md .env.example
  git commit -m "test: verify authenticated context selection flow"
  ```

## Plan self-review

- Spec coverage: backend discovery and selection contract is covered by Tasks 1–2; server-only token handling and HttpOnly context persistence by Tasks 1–2; shell-free route and selection UI by Task 3; profile mapping by Task 4; error handling, accessibility, e2e, and documentation by Tasks 3–5.
- Placeholder scan: no placeholder markers or unspecified edge-case steps remain.
- Type consistency: backend types are introduced in Task 1 and consumed by the service in Task 2, layout in Task 3, and mapper in Task 4; route names and cookie helper names are consistent throughout.
- Scope: no shell switching, profile editing, identity-provider changes, or unrelated admin API integration is included.
