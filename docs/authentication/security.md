# Security

## CORS

The deployment is same-origin only:

```
Frontend:  http://localhost:3100 (this environment) / https://app.finaxis.example (production)
Auth API:  <same origin>/api/auth/*
```

No custom CORS headers are added to `app/api/auth/[...all]/route.ts`. Keycloak's **Web
Origins** (browser CORS allowlist) are configured separately from its **redirect URIs**
(where OIDC responses may be returned) — see `docs/authentication/keycloak.md`. Neither
uses a wildcard. `Access-Control-Allow-Origin: *` combined with credentialed requests is
never used anywhere in this app.

## CSRF

Better Auth's CSRF/origin checks are never disabled — `advanced.disableCSRFCheck` and
`advanced.disableOriginCheck` do not appear anywhere in `auth/auth.ts`. State-changing
requests go through Better Auth's own POST APIs; the custom `/api/auth/logout` route is
POST-only (no `GET` export) specifically so a crawler, prefetch, or embedded `<img>`/`<a>`
cannot trigger a sign-out.

## Trusted origins

`AUTH_TRUSTED_ORIGINS` (validated in `config/env.server.ts`) is an exact, comma-separated
list — wildcards are rejected at startup, and `AUTH_POST_LOGOUT_REDIRECT_URI` must belong to
one of those origins or the app fails to start.

## Cookies

```
HttpOnly:      always
Secure:        production only (advanced.useSecureCookies)
SameSite:      Lax (Better Auth default — no flow in this app requires None)
Path:          /
Prefix:        finaxis
Domain:        host-only (no crossSubDomainCookies configured)
```

## Content Security Policy

`next.config.ts` sets a single `Content-Security-Policy` response header (via `headers()`) on
every route:

```
default-src 'self'
script-src 'self' 'unsafe-inline' ['unsafe-eval' in development only]
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self'
form-action 'self' <keycloak-origin>
frame-ancestors 'none'
base-uri 'self'
```

Two directives carry a narrow `'unsafe-inline'` carve-out — each scoped to a single directive,
not a blanket relaxation:

- **`style-src`**: Emotion (MUI's styling engine, via `AppRouterCacheProvider`) injects
  `<style>` tags without a CSP nonce in this setup.
- **`script-src`**: Next.js's own inline hydration/RSC bootstrap script (`self.__next_r`) is
  also un-nonced here. Without `'unsafe-inline'`, the browser blocks that inline script and the
  app never hydrates — every page gets stuck on its Suspense fallback, which is exactly what
  happens if this entry regresses back to `script-src 'self'` alone.
- **`unsafe-eval` in development only**: React uses `eval()` in development for debugging
  features such as reconstructing call stacks. Next.js documents that this is not needed in
  production, so `next.config.ts` adds it only when `NODE_ENV=development`.
- **`form-action`**: includes the Keycloak issuer's origin (derived from `KEYCLOAK_ISSUER` at
  CSP-emission time in `next.config.ts`), not just `'self'`. `KEYCLOAK_ISSUER` is required when
  emitting the header outside tests; missing or invalid values fail fast instead of silently
  baking `form-action 'self'` into the app. The sign-out flow
  (`components/shell/user-menu.tsx`) submits a real `<form>` to `/api/auth/logout`, which
  303-redirects the same top-level navigation on to Keycloak's RP-initiated logout endpoint.
  Chromium enforces `form-action` against every hop of that redirect chain, not only the
  form's own same-origin `action` attribute, so `form-action 'self'` alone silently blocks the
  entire logout navigation (no server-side error at all — only a devtools console message:
  `Sending form data to '...' violates ... "form-action 'self'"`). This was only caught by a
  real-browser round trip (`e2e/keycloak-smoke.spec.ts`); it is invisible to
  jsdom-based unit tests and to a browser exercising only same-origin flows like login.

Be clear-eyed about the tradeoff: this is a real, if narrow, weakening of `script-src` — it
means any inline `<script>` an attacker manages to get reflected into the page (e.g. via a
successful HTML-injection bug elsewhere) would execute, since the browser can no longer tell
"framework bootstrap" apart from "attacker-supplied inline script" using the directive alone.
The stricter alternative is per-request CSP nonces (Next.js supports this via `proxy.ts`
generating a nonce and threading it through), but that requires opting the whole app into
dynamic rendering (nonces can't be cached/statically generated) and wiring the same nonce
through MUI/Emotion's cache provider so its injected `<style>` tags carry it too. This app
deliberately does not adopt that path today; if `script-src 'self'` alone is ever required
(e.g. a stricter compliance requirement), revisit nonce-based CSP at that point rather than
re-removing `'unsafe-inline'` without the nonce plumbing in place.

## Reverse proxy / production origin

- `BETTER_AUTH_URL` is always set explicitly in production — never derived from
  client-supplied `X-Forwarded-Host`.
- The ingress/load balancer in front of production must overwrite (not merely append to)
  `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` so they can't be spoofed by a
  client — this app trusts those headers implicitly wherever Next.js or Better Auth read them.
- HTTPS is required in production (`config/env.server.ts` enforces this at startup); enable
  HSTS at the ingress or confirm `next.config.ts`'s production-only `Strict-Transport-Security`
  header reaches the client unmodified.
- The one exception: `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1` (local-only, never set in a real
  deployment) lets `localhost`/`127.0.0.1`/`::1` origins stay HTTP even under
  `NODE_ENV=production` — needed because Next's standalone server (`pnpm start`, the Dockerfile)
  hardcodes `NODE_ENV=production` unconditionally, so there's no other way to run that build
  locally at all. A non-local origin still requires HTTPS regardless of this flag. See
  `config/env.server.ts`'s `isInsecureLocalOriginAllowed`.
- Keycloak must see the exact public redirect URI — if the app sits behind a path-rewriting
  proxy, register the externally visible callback path, not the internal one.

## Known limitation: no `id_token_hint` on logout

`app/api/auth/logout/route.ts` builds Keycloak's RP-initiated logout URL with only
`client_id` and an allowlisted `post_logout_redirect_uri` — it does not include
`id_token_hint`. Better Auth 1.6.23 has no documented, safe, server-only API to retrieve the
stored Keycloak ID token (`auth.api.getAccessToken` returns only the access/refresh token
pair). Keycloak's RP-Initiated Logout accepts `client_id` + a registered
`post_logout_redirect_uri` in place of `id_token_hint` for a confidential client, which this
app relies on. If a future Better Auth version exposes the ID token through a supported API,
switch to passing `id_token_hint` for stricter logout-request validation.

## Rate limiting

Enabled in production (`auth/auth.ts`'s `rateLimit.enabled: serverEnv.NODE_ENV ===
'production'`), with tighter custom rules on the OAuth callback and sign-out endpoints.

The default in-memory rate-limit store is not sufficient once more than one application
instance runs (multiple instances don't share counters), so `auth/auth.ts` backs the limiter
with Redis instead: when `REDIS_URL` is set, `rateLimit.customStorage` is set to a small
`ioredis`-backed atomic increment-with-TTL implementation (`createRedisRateLimitStorage` in
`auth/auth.ts`). This deliberately does **not** use Better Auth's top-level `secondaryStorage`
option — Better Auth treats any configured `secondaryStorage` (or `database`) as making the
deployment "stateful" and silently disables `session.cookieCache.refreshCache` as a result
(confirmed against its source: `hasServerSessionStore` checks exactly those two options), which
would undermine the fully-stateless session design in `docs/authentication/stateless-sessions.md`
for a change that's only supposed to affect rate-limit counters. `rateLimit.customStorage` has
no such side effect. `REDIS_URL` is required in production (`config/env.server.ts`'s
`assertRedisUrlInProduction`) and unset in development/test, where rate limiting stays disabled
and no local Redis is needed. Every key is namespaced under `REDIS_KEY_PREFIX` (defaults to
`finaxis-web`) so one Redis instance can be shared across multiple apps/environments without key
collisions — see `docs/deployment.md` for how this is wired up on the VPS/Coolify deployment.

## Test strategy

### Unit / component tests (Vitest + React Testing Library)

Tests live alongside the code they cover: `auth/*.test.ts` (e.g.
`get-authenticated-user.test.ts`, `map-authenticated-user.test.ts`,
`build-keycloak-logout-url.test.ts`), `config/env.server.test.ts`, and
`components/auth/*.test.tsx` / `components/shell/*.test.tsx` (e.g.
`continue-with-keycloak-button.test.tsx`, `user-menu.test.tsx`,
`app/(authenticated)/layout.test.tsx`). These tests mock Better Auth at module boundaries
— `vi.mock('./auth', ...)` for the server instance's `auth.api.getSession`, and
`vi.mock('@/auth/auth-client', ...)` for the browser client — rather than exercising
Better Auth's own internals. This keeps the suite fast and focused on this app's code
(route guards, claim mapping, logout-URL construction, rendering) without depending on a
running Keycloak instance.

### E2E tests (Playwright)

The default `pnpm test:e2e` suite (`e2e/login.spec.ts`, `e2e/protected-routes.spec.ts`) is
Keycloak-independent: it only exercises unauthenticated behavior — the root-to-`/login`
redirect, login-page branding, the "Continue to Finaxis" action, generic error/status
messaging for `authentication_failed` / `session_expired` / `logged_out` redirects,
responsive layout, light/dark rendering, and accessibility (via `@axe-core/playwright`).
Authenticated-shell behavior (route guard, session mapping, user menu, sign-out) is covered
by the unit/component tests above and intentionally not duplicated at the E2E layer.
`playwright.config.ts` explicitly `testIgnore`s `e2e/keycloak-smoke.spec.ts` so this default
suite never depends on a running Keycloak instance.

A separate, real-Keycloak smoke test (`e2e/keycloak-smoke.spec.ts`,
`playwright.keycloak.config.ts`, run via `pnpm test:e2e:keycloak`) exercises one genuine
browser round trip against a live local Keycloak: login redirect → Keycloak's hosted login
form → the authenticated shell (admin overview, app switcher, workspace navigation, profile
empty states) → sign-out → Keycloak's logout confirmation page → session truly cleared. It
`test.skip`s with an actionable message if Keycloak isn't reachable on `:8080`, and is never
part of the default `pnpm test:e2e` gate. Running it for real against a live Keycloak is what
surfaced both the `form-action` CSP gap above and the submit-button-disabling bug described in
`components/shell/user-menu.tsx` — neither was reachable from jsdom-based unit tests.

## Troubleshooting

| Symptom                                                                                                   | Likely cause                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Invalid Origin" from Better Auth                                                                         | The request's origin isn't in `AUTH_TRUSTED_ORIGINS`                                                                                                                               |
| Redirect loop between `/login` and `/admin`                                                               | `/login` should not be redirected by `proxy.ts` based only on cookie presence; the authenticated layout remains the server-side session authority                                  |
| Cookies not being set after the Keycloak callback                                                         | `BETTER_AUTH_URL` doesn't match the origin the browser is actually using (e.g. testing on `3100` with `BETTER_AUTH_URL` still set to `3000`)                                       |
| `431 Request Header Fields Too Large`                                                                     | Account/session cookie has grown too large — see `docs/authentication/stateless-sessions.md`'s token-size risk                                                                     |
| Logout doesn't end the Keycloak SSO session                                                               | Confirm the browser did a real top-level navigation to the logout URL (not a `fetch`) — see `components/shell/user-menu.tsx`                                                       |
| Logout button shows "Signing out…" forever, no request ever reaches `/api/auth/logout` in the network tab | Devtools console shows a `form-action` CSP violation — the Keycloak issuer's origin is missing from `next.config.ts`'s `form-action` directive (see Content Security Policy above) |
| Logout redirects to a Keycloak "Do you want to log out?" page instead of straight back to `/login`        | Expected — see "Known limitation: no `id_token_hint` on logout" above; a real user must click Keycloak's "Logout" confirmation button                                              |
