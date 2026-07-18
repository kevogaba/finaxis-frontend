# Stateless Better Auth + Keycloak Authentication and Finaxis App Shell

Status: Approved for planning
Date: 2026-07-17

## 1. Goal and scope

Replace the mock login on `finaxis-web` with real Keycloak OIDC authentication via Better Auth,
protect authenticated routes, and stand up the first authenticated Finaxis application shell with
an Administration module (Overview implemented, other sections polished placeholders) and a
read-only profile page.

Out of scope for this iteration: business APIs, authorization policies, real user provisioning,
real branch/organization resolution (a typed hardcoded fixture stands in), notification delivery,
and the full module-switcher contents beyond Administration.

## 2. Architecture

```
Browser --(same-origin HTTPS cookie)--> Next.js + Better Auth --(OIDC Auth Code + PKCE)--> Keycloak
```

- Better Auth is the application's OIDC client (confidential), using the Generic OAuth plugin and
  its `keycloak()` provider helper.
- Package: `better-auth@1.6.23` (latest stable on npm, verified against published docs via
  Context7). This version's Generic OAuth API is `signIn.oauth2({ providerId, callbackURL,
errorCallbackURL })` with callback path `/api/auth/oauth2/callback/:providerId`, `issuer` and
  `requireIssuerValidation` as valid config. (Better Auth 1.7 renames this to `signIn.social()`
  with a different callback path and removes `issuer`/`requireIssuerValidation` — we deliberately
  stay on 1.6.x semantics since that's the installed major.)
- Sessions are stateless: no database, `session.cookieCache` with `strategy: "jwe"`, 8h lifetime,
  `account.storeAccountCookie: true` to keep the OAuth account/tokens in an encrypted cookie.
- Same-origin only: the browser never calls Keycloak's token endpoint directly; all protocol
  traffic goes through `/api/auth/*`.
- CSRF/origin checks stay enabled (`disableCSRFCheck`/`disableOriginCheck` must never be set).
  Trusted origins are exact, no wildcards.
- Exact env vars, cookie flags, CSP/security headers, and rate-limiting requirements are as
  specified in the original task brief (sections 4, 24–29) and are not repeated here — they apply
  as written.

**Open technical risk, to resolve during implementation, not blocking design:**

- Exact import path for `keycloak()`/`genericOAuth` (`better-auth/plugins` vs
  `better-auth/plugins/generic-oauth` — Context7 docs show both for the same version). Verify
  against the installed package's actual export map.
- Whether Better Auth 1.6.23 exposes the stored Keycloak ID token safely server-side for
  RP-initiated logout's `id_token_hint`. If not available through a supported server-only API,
  logout falls back to the client-id-only Keycloak logout form, and this limitation is documented
  explicitly rather than claimed to work.

## 3. Keycloak client (cross-repo change)

The `finaxis` realm (`/home/ogaba/finaxis/platform/docker/keycloak/import/finaxis-realm.json`)
currently only has `finaxis-platform` — a public client with direct-access-grants for the Spring
Boot backend/smoke test. It is not suitable for a browser OIDC client. A new client is required:

- `clientId: finaxis-web`, confidential (client secret), Standard Flow enabled, Implicit disabled,
  Direct Access Grants disabled, Service Accounts disabled, PKCE `S256`.
- Redirect URIs: `http://localhost:3000/api/auth/oauth2/callback/keycloak` (documented canonical
  example) and `http://localhost:3100/api/auth/oauth2/callback/keycloak` (this environment).
- Web origins: `http://localhost:3000`, `http://localhost:3100`.
- Post-logout redirect URIs: `http://localhost:3000/login`, `http://localhost:3100/login`.
- Created via the Keycloak Admin REST API against the already-running container (immediate,
  testable), and the same client definition appended to `finaxis-realm.json` so a clean
  `--import-realm` stays in sync. The generated client secret is written only to this repo's
  `.env.local` (gitignored) — never committed, never placed in the realm export in plaintext
  beyond what Keycloak's own export already contains for its local-only dev users.

## 4. Local port handling

The platform's `grafana-lgtm` container binds host port 3000 — the same port this app's tooling
defaults to. `pnpm dev`, `pnpm build && pnpm start`, and Playwright's `webServer` in this repo will
default to `PORT=3100` (env-overridable), while `docs/authentication/keycloak.md` documents `3000`
as the canonical example for environments without that conflict, with a note on the override.

## 5. File layout (adapted to existing structure)

This repo has no `src/` directory — the App Router and all supporting code live at repo root
(`app/`, `components/`, `theme/`, `test/`). The original brief's suggested `src/...` layout is
adapted accordingly:

```
auth/
  auth.ts                       # betterAuth() server instance
  auth-client.ts                # createAuthClient (browser-safe)
  auth.types.ts                 # FinaxisUser, AssignedBranch, OrganizationSummary
  get-authenticated-user.ts     # server helper: session -> FinaxisUser
  map-authenticated-user.ts     # claims -> FinaxisUser mapping boundary
config/
  env.server.ts                 # zod-validated server-only env
  application-context.ts        # typed org/branch/module fixture
app/
  (public)/login/page.tsx       # existing login page, mock form replaced
  (authenticated)/
    layout.tsx                  # server-side session guard (auth.api.getSession)
    admin/
      layout.tsx, page.tsx (Overview)
      users/page.tsx, branches/page.tsx, roles/page.tsx, settings/page.tsx, audit/page.tsx
    profile/page.tsx
  api/auth/[...all]/route.ts    # toNextJsHandler(auth)
  api/auth/logout/route.ts      # controlled RP-initiated logout (POST-first)
components/
  shell/                        # app-shell, global-header, workspace-drawer,
                                 # workspace-navigation, app-switcher, user-menu,
                                 # theme-mode-menu, organization-context,
                                 # notification-button, mobile-navigation-button,
                                 # shell.constants.ts
  profile/                      # profile page components
  auth/                         # updated login button/form, error states (mock bits removed)
modules/
  administration/administration-navigation.ts, administration-module.ts
proxy.ts                        # Next 16's renamed middleware — optimistic redirect only
docs/authentication/
  architecture.md, keycloak.md, stateless-sessions.md, security.md
```

## 6. Route protection

`(authenticated)/layout.tsx` calls `auth.api.getSession({ headers: await headers() })` and
redirects to `/login?reason=session_expired` when absent — the authoritative guard. `proxy.ts`
only does optimistic redirects based on cookie presence (never authorization), excludes static
assets and `/api/auth/*`, and avoids redirect loops, per the original brief's section 12.

## 7. Logout

`POST /api/auth/logout`: clears the Better Auth session, then redirects to Keycloak's
`end_session_endpoint` (from OIDC discovery) with a validated `post_logout_redirect_uri` and
`id_token_hint` when safely retrievable server-side (see open risk in §2). Never accepts an
arbitrary client-supplied redirect. Initiated via POST from the user menu to avoid
crawler/prefetch-triggered logout.

## 8. App shell, Administration module, profile page

As specified in the original task brief sections 13–22, 30: MUI-only shell components (`AppBar`,
`Drawer`, `Menu`, etc.), desktop/mobile layouts, top navigation showing module/org/branch/user
context from the typed `application-context.ts` fixture, extensible app switcher (Administration
active, others visibly disabled, no fake routes), Administration drawer with Overview implemented
and other sections as polished placeholders (no lorem ipsum, no fake tables), theme mode menu
(System default/Light/Dark) via MUI's color-scheme API, notification bell placeholder, user menu,
and a read-only profile page rendering a sanitized `FinaxisUser` DTO with explicit "not assigned"
empty states. No business data, no edit functionality.

## 9. Testing strategy

- **Unit/component (Vitest + RTL):** all 14 cases listed in the original brief §31, mocking Better
  Auth at module boundaries — login button OAuth initiation, duplicate-submit guard, accessible
  error states, user menu, theme menu, app switcher (active/disabled), drawer active-route
  highlighting, mobile drawer, profile empty/populated states, logout untrusted-redirect
  rejection, malformed-claims mapping.
- **E2E (Playwright), default `pnpm test:e2e` — Keycloak-independent:** unauthenticated `/admin`
  and `/profile` redirects, login page UI/theme/a11y, and authenticated-shell/profile/logout-flow
  tests driven by a seeded valid session cookie (not a live IdP round trip). This suite is the CI
  gate and never depends on the platform's Keycloak being up.
- **E2E, real Keycloak smoke test — separate, manual, not in the CI gate:** `pnpm
test:e2e:keycloak` performs one real login against the local `finaxis` realm's `local.admin`
  user to exercise the actual redirect → callback → session → logout protocol end-to-end.
  Documented as requiring the platform's docker compose stack to be running; clearly labeled as
  distinct from the mocked/seeded default suite.

## 10. Documentation

`docs/authentication/{architecture,keycloak,stateless-sessions,security}.md` as specified in the
original brief §33, including the Mermaid login sequence diagram and a logout sequence diagram,
env vars, cookie model, stateless-session trade-offs and token-size risk, CORS/CSRF/trusted-origin
policy, reverse-proxy requirements, claim mapping, test strategy, and troubleshooting.
`README.md` and `AGENTS.md` updated per §33's listed rules (server-side session validation always
authoritative, never expose provider tokens to Client Components, never disable CSRF/origin
checks, never wildcard trusted origins, no local-storage tokens, no arbitrary callback/logout
redirects, all new shell routes use MUI, typed application context, sanitized profile DTO).

## 11. Deviations from the original task brief

- No `src/` directory introduced — existing root-level layout preserved (§5 above).
- Default `pnpm test:e2e` does not drive a real Keycloak login (resolved per user decision);
  real-IdP verification is a separate, manually-invoked script.
- Local dev/test port is `3100` in this environment (grafana-lgtm holds 3000), not `3000`;
  documentation still shows `3000` as the portable canonical example.
- §32's optional `infra/keycloak/` dev environment is not duplicated — the platform repo already
  provides a working local realm/compose setup; docs point there instead.

## 12. Acceptance criteria

Unchanged from the original brief §36 — Better Auth runs without a database, Keycloak OIDC login
works through Authorization Code + PKCE, callback handled by Better Auth, protected routes
validate server-side, default authenticated route is `/admin`, MUI shell works desktop/mobile,
header shows module/org/branch/user, app switcher and Administration drawer work, logout clears
local session and terminates Keycloak SSO, profile page shows sanitized details, theme has three
modes, CORS/CSRF/cookie/HTTPS requirements hold, and all validation commands
(`pnpm check`, `test:coverage`, `build`, `test:e2e`) pass.
