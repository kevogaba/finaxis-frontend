# Keycloak client configuration

## Realm

- Realm: `finaxis`
- This client: `finaxis-web` (confidential, browser-facing) — distinct from `finaxis-platform`
  (public, direct-access-grants, used only by the Spring Boot backend and its smoke test).

## Client settings

```
Client authentication:        Enabled (confidential)
Standard flow:                Enabled
Implicit flow:                Disabled
Direct access grants:         Disabled
Service accounts:             Disabled
PKCE:                         S256
```

## Local development

```
Root URL:
http://localhost:3100 (this environment; 3000 is canonical
— see the port note below)

Valid redirect URI:
http://localhost:3100/api/auth/oauth2/callback/keycloak

Valid post-logout redirect URI:
http://localhost:3100/login

Web origin:
http://localhost:3100
```

The `finaxis-web` client must also include an `oidc-audience-mapper` protocol mapper that adds
`finaxis-platform` to the access-token audience. The frontend keeps the token server-side, then
uses it when calling the Spring resource server, whose accepted audience is `finaxis-platform`.
Without this mapper, login succeeds but the first organisation-discovery request returns `401`.

> **Port note:** this environment runs the frontend on `3100` because the platform's
> `grafana-lgtm` container already holds `3000`. The Keycloak client registers both
> `3000` and `3100` variants of every URI above so the same client definition works
> in either environment. Set `BETTER_AUTH_URL` (and the matching Keycloak URIs) to
> whichever port your environment actually uses.

## Production

Use exact HTTPS origins — never `*`, `https://*`, or `http://*`:

```
https://app.finaxis.example/api/auth/oauth2/callback/keycloak
https://app.finaxis.example/login
https://app.finaxis.example
```

## Scopes

Required: `openid`, `profile`, `email`.

## Optional claim mappers

The application tolerates all of these being absent — it does not fabricate values for
them. Currently none of these mappers exist on the realm; `roles`/`branches`/`organization`
render as explicit "not assigned" states in the UI until they're added:

```
preferred_username
given_name
family_name
name
email
email_verified
roles
groups
branch_ids
organization_id
organization_name
```

## Environment variables

`.env.example` at the repo root is the source of truth for local setup — copy it to
`.env.local` and fill in the blanks. It defines:

| Variable                        | Purpose                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`               | The app's own public origin; Better Auth uses it to build callback and redirect URLs.                                         |
| `BETTER_AUTH_SECRET`            | Symmetric secret Better Auth uses to sign/encrypt session cookies — generate with `openssl rand -base64 48`, never commit it. |
| `KEYCLOAK_ISSUER`               | The realm's issuer URL (e.g. `https://identity.example.com/realms/finaxis`), used for OIDC discovery.                         |
| `KEYCLOAK_CLIENT_ID`            | The `finaxis-web` client ID registered in Keycloak (see above).                                                               |
| `KEYCLOAK_CLIENT_SECRET`        | The confidential client's secret, used in the authorization-code token exchange.                                              |
| `AUTH_TRUSTED_ORIGINS`          | Comma-separated exact origins Better Auth accepts requests from — no wildcards.                                               |
| `AUTH_POST_LOGOUT_REDIRECT_URI` | Where Keycloak sends the browser after RP-initiated logout; must belong to a trusted origin.                                  |

`config/env.server.ts` validates all of these at startup and fails fast if any are missing
or malformed (e.g. a wildcard in `AUTH_TRUSTED_ORIGINS`).

## Admin API client creation (this environment)

The `finaxis-web` client was created against the already-running local Keycloak via the
Admin REST API (see the implementation plan's Task 1) and the same definition was appended
to `platform/docker/keycloak/import/finaxis-realm.json` so a clean `--import-realm` recreates
it identically. The client secret lives only in `finaxis-frontend/.env.local` (gitignored)
and, for local-dev convenience only, in that realm export file — never in a production
realm export.
