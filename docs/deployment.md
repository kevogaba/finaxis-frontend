# Deployment

This app is a server-rendered Next.js application — server-side session validation
(`auth.api.getSession`), Keycloak token handling, and dynamic security headers all require a
running Node process, so it cannot ship as a static export. This doc covers deploying it to a VPS
managed by [Coolify](https://coolify.io), building from the repo's `Dockerfile`.

## Build

- `next.config.ts` sets `output: 'standalone'`, so `pnpm build` produces a pruned
  `.next/standalone` directory (own `node_modules`, a `server.js` entrypoint). The standalone
  output doesn't include `public/` or `.next/static` on its own, so a `postbuild` script
  (`package.json`) copies both in after every build — the `Dockerfile`'s runner stage then just
  copies the already-self-contained `.next/standalone` in one step.
- The `Dockerfile` is a three-stage build (`deps` → `builder` → `runner`) pinned to `node:24-alpine`
  to match `.nvmrc`/`.node-version`, using `corepack enable` so `pnpm@12.3.4` (the version pinned
  in `package.json`'s `packageManager` field) is what actually runs the install/build, not
  whatever `pnpm` the build host happens to have.
- No real secrets are needed at build time: `config/env.server.ts`'s Zod schema is validated
  lazily (on first property access, not at import), so `pnpm build` never touches production env
  values, and nothing in this codebase is a `NEXT_PUBLIC_*` variable that would need baking into
  the client bundle.
- `.dockerignore` excludes the host's `node_modules` — this matters for correctness, not just
  image size: without it, the builder stage's `COPY . .` would overwrite the freshly-installed
  Linux/musl `node_modules` (with correctly-resolved native binaries, e.g. `sharp`) with whatever
  `node_modules` happens to exist on the machine running `docker build`.

## Testing the standalone build locally

`pnpm start` runs `node --env-file=.env.local .next/standalone/server.js` — the same server the
Dockerfile runs, so this is the closest local equivalent to what actually deploys. Two things to
know before running it:

- The standalone server doesn't auto-load `.env.local` the way `next dev`/`next start` do (it's a
  bare Node script); `--env-file` (native to Node ≥20.6) is what makes `pnpm start` pick up the
  same values `pnpm dev` uses.
- It hardcodes `NODE_ENV=production` unconditionally, which would otherwise hit
  `config/env.server.ts`'s HTTPS-only-in-production check against `.env.local`'s `http://localhost`
  values. Set `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1` in `.env.local` (gitignored, local-only,
  never set in a real deployment) to allow `localhost`/`127.0.0.1` origins specifically —
  everything non-local still requires HTTPS regardless. See
  `docs/authentication/security.md`'s "Reverse proxy / production origin" section.

This gets the server booting and serving correctly, but a full authenticated round-trip still
needs a real Keycloak reachable at whatever `KEYCLOAK_ISSUER` points to (OIDC discovery needs a
real, working endpoint, not just an HTTPS-shaped string) and a real Redis at `REDIS_URL` if you
want production's rate-limit path (rather than the in-memory fallback) exercised too.

## Prerequisites: external services

This app doesn't provision or manage any of its backing services — Keycloak, the Spring backend
API, and Redis are all assumed to already be running somewhere reachable from the Coolify-managed
VPS (whether that's other containers in the same Coolify project, other services on the same
network, or fully external hosts). Deployment is just a matter of supplying their URLs as
environment variables (below); Coolify isn't asked to create, own, or one-click-provision any of
them.

## Coolify setup

1. **Resource**: connect the repo (GitHub App integration), deploy branch `main`. (Coolify also
   supports deploying an already-built image from a registry as a separate "Docker Image" resource
   type instead of building from a connected repo — not used here, since there's no CI step that
   builds/pushes an image; Coolify builds directly from this repo's `Dockerfile` instead.)
2. **Build Pack**: `Dockerfile` (not Nixpacks — Coolify's own docs note Nixpacks' Next.js support
   doesn't cover standalone output, health checks, or env-var handling, and this repo's pinned
   Node/pnpm versions and `pnpm-workspace.yaml` native-build settings are easier to reproduce
   explicitly than to trust to auto-detection).
3. **Port**: Coolify defaults `PORT` to the first port the Dockerfile `EXPOSE`s if left unset, so
   `3100` (the app's existing default) is picked up automatically — no manual port config needed
   unless overriding it.
4. **Health check**: nothing to configure in Coolify's UI. Coolify's own docs note that when a
   health check exists in both the Dockerfile and the UI, **the Dockerfile's takes precedence** —
   and the `Dockerfile` here already defines one against `/api/health`
   (`app/api/health/route.ts`; unauthenticated, not covered by `proxy.ts`'s matcher), written in
   plain Node specifically because a UI-configured check needs `curl`/`wget` in the image, which
   this `node:alpine`-based image deliberately doesn't include.
5. **Environment variables** — Coolify's dashboard lets each variable be marked "Build + Runtime"
   (default), "Build only", or "Runtime only". Set every variable below as **Runtime only**: none
   of them are needed at build time (`config/env.server.ts`'s Zod schema validates lazily, on
   first property access — see "Build" above), and keeping secrets out of the build phase means
   they're never at risk of being baked into an image layer. See `.env.example` for the full
   annotated list:

   | Variable                                        | Notes                                                                                                                                                                    |
   | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `BETTER_AUTH_URL`                               | Exact `https://` production origin.                                                                                                                                      |
   | `BETTER_AUTH_SECRET`                            | ≥32 chars.                                                                                                                                                               |
   | `PLATFORM_ORGANISATION_ID`                      | UUID.                                                                                                                                                                    |
   | `KEYCLOAK_ISSUER`                               | `https://<keycloak-domain>/realms/finaxis` — the already-running Keycloak instance. Also required just to emit response headers — see `docs/authentication/security.md`. |
   | `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` |                                                                                                                                                                          |
   | `AUTH_TRUSTED_ORIGINS`                          | Exact origin(s), comma-separated, no wildcards.                                                                                                                          |
   | `AUTH_POST_LOGOUT_REDIRECT_URI`                 | Must belong to a trusted origin.                                                                                                                                         |
   | `FINAXIS_API_URL`                               | The already-running backend Spring API's origin, reachable from the VPS.                                                                                                 |
   | `REDIS_URL`                                     | The already-running Redis instance's connection string. See below. Required in production.                                                                               |
   | `REDIS_KEY_PREFIX`                              | See below. Defaults to `finaxis-web` if unset.                                                                                                                           |

6. **Redis**: point `REDIS_URL` at the already-running instance — `ioredis` parses credentials
   directly out of the URL, so either auth style works with no extra config:
   - username + password (Redis 6+ ACLs): `redis://default:password@host:6379`
   - password only (legacy `requirepass`): `redis://:password@host:6379`
   - add `rediss://` instead of `redis://` if the Redis server requires TLS.

   `auth/auth.ts` uses it to back Better Auth's rate limiter (`rateLimit.customStorage`, a small
   `ioredis`-backed atomic increment-with-TTL implementation) with a shared store instead of the
   default in-memory one, which doesn't survive more than one running instance — see
   `docs/authentication/security.md` for why this goes through `customStorage` rather than Better
   Auth's `secondaryStorage` option. If this Redis instance is shared with other apps or other
   environments of this same app (staging, another deployment), set `REDIS_KEY_PREFIX` to
   something unique per deployment (e.g. `finaxis-web-prod`) — every key this app writes is
   namespaced under it (`<prefix>:better-auth:ratelimit:<key>`), so mismatched prefixes across
   environments just mean separate counters, never a correctness bug, but a shared prefix between
   two genuinely different deployments would let them clobber each other's rate-limit counters.

7. **Replicas**: with the rate limiter backed by Redis, running more than one instance is safe.
   Still start with 1 for the first deploy to validate health checks, Keycloak login, and headers
   end-to-end before considering scaling out.
8. **Domain/TLS**: attach the production domain — Coolify's built-in proxy auto-provisions
   Let's Encrypt TLS. Confirm afterwards that it _overwrites_ (not appends to)
   `X-Forwarded-Host`/`X-Forwarded-Proto`/`X-Forwarded-For`, per the trust assumption in
   `docs/authentication/security.md`.
9. **Keycloak**: register the exact externally-visible callback/redirect path for this domain in
   the already-running Keycloak's client configuration _before_ cutover, or login will fail.

## Verifying a deploy

- `GET /api/health` over HTTPS returns `{"status":"ok"}`.
- A full login → authenticated shell → logout round trip against production Keycloak succeeds.
- Response headers include the expected CSP/HSTS values (see `docs/authentication/security.md`),
  and cookies are `Secure` (confirms the `X-Forwarded-*` trust chain is intact).
- `redis-cli KEYS '<REDIS_KEY_PREFIX>:*'` (e.g. `finaxis-web-prod:*`) against the Redis instance
  shows keys after a few requests, confirming the rate limiter is actually using Redis rather than
  silently falling back.
