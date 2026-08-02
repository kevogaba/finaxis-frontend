# Authentication architecture

Finaxis uses Better Auth as its OIDC client, with Keycloak as the identity
provider, entirely through same-origin `/api/auth/*` routes. The browser
never talks to Keycloak's token endpoint directly.

## Login sequence

```mermaid
sequenceDiagram
actor User
participant Browser
participant Finaxis as Finaxis / Better Auth
participant Keycloak

    User->>Browser: Select "Continue to Finaxis"
    Browser->>Finaxis: POST /api/auth/sign-in/oauth2 (providerId: keycloak)
    Finaxis->>Browser: Redirect to Keycloak with PKCE challenge + state
    Browser->>Keycloak: Authorization request
    User->>Keycloak: Authenticate
    Keycloak->>Browser: Redirect with authorization code + state
    Browser->>Finaxis: GET /api/auth/oauth2/callback/keycloak
    Finaxis->>Keycloak: Exchange code for tokens (PKCE verifier)
    Keycloak-->>Finaxis: Tokens + identity claims
    Finaxis-->>Browser: Encrypted HttpOnly session cookie (Set-Cookie)
    Browser->>Finaxis: GET /admin
    Finaxis->>Finaxis: Validate session and discover selected context
    Finaxis-->>Browser: Redirect to /select-context when context is absent
    User->>Browser: Choose organisation, then branch
    Browser->>Finaxis: POST /api/context/organisation and /api/context/branch
    Finaxis->>Finaxis: Select context upstream and persist opaque token in HttpOnly cookie
    Browser->>Finaxis: GET /admin or /profile
    Finaxis->>Finaxis: Resolve backend profile for selected context
    Finaxis-->>Browser: Authenticated app shell and profile
```

## Logout sequence

```mermaid
sequenceDiagram
actor User
participant Browser
participant Finaxis as Finaxis / Better Auth
participant Keycloak

    User->>Browser: Select "Log out" (form POST)
    Browser->>Finaxis: POST /api/auth/logout
    Finaxis->>Finaxis: Clear the Better Auth session cookie
    Finaxis-->>Browser: 303 redirect to Keycloak end_session_endpoint
    Browser->>Keycloak: GET .../protocol/openid-connect/logout?client_id=...&post_logout_redirect_uri=...
    Keycloak->>Keycloak: Clear its own SSO session cookie
    Keycloak-->>Browser: Redirect to post_logout_redirect_uri
    Browser->>Finaxis: GET /login?reason=logged_out
```

## Components

- `auth/auth.ts` — the Better Auth server instance (Generic OAuth + `keycloak()`, stateless
  `jwe` cookie-cache sessions, `nextCookies()`).
- `app/api/auth/[...all]/route.ts` — Better Auth's own Next.js handler, mounted same-origin.
- `app/api/auth/logout/route.ts` — the custom, POST-only, validated Keycloak RP-initiated logout.
- `auth/auth-client.ts` — the browser-safe client used to start sign-in and (via the user menu's
  form) sign-out.
- `auth/get-authenticated-user.ts` / `auth/map-authenticated-user.ts` — the single server-side
  boundary between Better Auth's session shape and the application's `FinaxisUser` DTO.
- `auth/backend-api.ts` / `auth/context-service.ts` — server-only backend proxy and context/profile
  application service. Keycloak access tokens and the selected context token remain server-side.
- `app/select-context/page.tsx` / `components/context/context-selection-page.tsx` — shell-free
  organisation and branch selection UI, backed by same-origin route handlers.
- `app/(authenticated)/layout.tsx` — the authoritative, server-validated route guard.
- `proxy.ts` — optimistic, cookie-presence-only redirects; never the authorization boundary.

## Callback URL

```
http://localhost:3100/api/auth/oauth2/callback/keycloak   (this environment)
http://localhost:3000/api/auth/oauth2/callback/keycloak   (canonical/documented example)
```

See `docs/authentication/keycloak.md` for the full client configuration and
`docs/authentication/stateless-sessions.md` for the session model.
