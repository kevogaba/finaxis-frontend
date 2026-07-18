# Stateless Better Auth + Keycloak Authentication and Finaxis App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock login with real Keycloak OIDC authentication via stateless Better Auth, protect authenticated routes server-side, and stand up the first authenticated Finaxis app shell (Administration module + profile page).

**Architecture:** Better Auth's Generic OAuth plugin + `keycloak()` helper drive an Authorization Code + PKCE flow against the existing local Keycloak `finaxis` realm, entirely through same-origin `/api/auth/*` routes, with no database — sessions live in an encrypted (`jwe`) cookie. A server-validated `(authenticated)` layout guards `/admin` and `/profile`; `proxy.ts` only does optimistic cookie-presence redirects. The app shell (MUI-only) renders module/org/branch/user context from a typed fixture, an extensible app switcher, and an Administration drawer with one implemented Overview page and polished placeholders elsewhere.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.7, TypeScript strict, `better-auth@1.6.23`, MUI v9.2.0, Tailwind v4 (layout only), Zod v4, Vitest + RTL, Playwright + axe-core.

**Design doc:** `docs/superpowers/specs/2026-07-17-better-auth-keycloak-design.md`

## Global Constraints

- Node `>=24.9.0`, pnpm `11.13.1`. Package manager is pnpm — never use npm/yarn to install.
- No `src/` directory — all app code lives at repo root (`app/`, `components/`, `theme/`, `test/`, `auth/`, `config/`, `modules/`), matching the existing layout.
- Run `pnpm check` after every task; run `pnpm test:e2e` for any task touching rendered UI. A task is not done until both are clean (per `AGENTS.md`).
- Never use `@ts-ignore`, `@ts-nocheck`, unsafe `any`, or disable an ESLint rule to silence a warning — fix the underlying issue. ESLint runs `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` and `eslint-plugin-jsx-a11y` `strict` — assume every file must satisfy these.
- MUI + Tailwind (layout only) is the whole UI stack — no Chakra/Ant/shadcn/styled-components/Bootstrap, no global state library.
- Use MUI theme tokens (`theme/create-finaxis-theme.ts`, `theme/theme.types.ts`) instead of raw colors.
- Tailwind is layout composition only (flex/grid/gap/width/height/positioning/visibility) — never overrides MUI component internals.
- Server Components are the default; add `'use client'` only where interaction/browser APIs/MUI hooks require it.
- Never pass a function prop (including `sx={(theme) => ...}` callbacks or `component={Link}`) from a Server Component into a Client Component. Route `next/link` through `components/navigation/next-link.tsx` when a Server Component needs to pass it as a `component` prop. Plain serializable data props (objects/arrays/strings) are fine.
- This is MUI v9 — `Stack`'s `alignItems`/`justifyContent`/`flexWrap` and `Checkbox`/`Radio`'s `inputRef` moved to `sx`/`slotProps.input`. Verify against `node_modules/@mui/material` when unsure.
- Maintain accessibility: one `h1` per page, visible focus rings, labelled fields, errors associated with fields, `prefers-reduced-motion` respected, no serious/critical axe violations.
- Never disable Better Auth's CSRF or origin checks (`disableCSRFCheck`, `disableOriginCheck` must never appear). Trusted origins are exact strings, never wildcards.
- Never place access/refresh/ID tokens in local storage, session storage, readable cookies, URL query params post-auth, or client-visible React state.
- Local dev/test port in **this environment** is `3100` (the platform's `grafana-lgtm` container holds `3000`); `docs/authentication/keycloak.md` documents `3000` as the portable canonical example with a note on the override.
- Default `pnpm test:e2e` never depends on a live Keycloak; the real-IdP smoke test is a separate, manually invoked script.
- Update `README.md` and `AGENTS.md` whenever architecture changes, per existing repo convention.

---

### Task 1: Create the `finaxis-web` Keycloak client

**Files:**

- Modify (cross-repo): `/home/ogaba/finaxis/platform/docker/keycloak/import/finaxis-realm.json`
- No repo files in `finaxis-frontend` yet — this task is infrastructure only.

**Interfaces:**

- Produces: a confidential OIDC client `finaxis-web` in the `finaxis` realm, its client secret (captured for Task 2), and the exact redirect/origin/logout URIs later tasks depend on.

- [ ] **Step 1: Confirm Keycloak is reachable and capture an admin token**

Run:

```bash
curl -fsS http://localhost:8080/realms/finaxis/.well-known/openid-configuration | python3 -m json.tool | head -20

ADMIN_TOKEN="$(curl -fsS -X POST 'http://localhost:8080/realms/master/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id=admin-cli' \
  --data-urlencode 'username=admin' \
  --data-urlencode 'password=admin' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

echo "Token captured: ${#ADMIN_TOKEN} chars"
```

Expected: the discovery document prints, and the token length is printed (a non-trivial JWT, several hundred characters). `admin`/`admin` are the `KC_BOOTSTRAP_ADMIN_USERNAME`/`KC_BOOTSTRAP_ADMIN_PASSWORD` values from `platform/compose.yaml`.

- [ ] **Step 2: Create the confidential client via the Admin REST API**

Run:

```bash
curl -fsS -X POST 'http://localhost:8080/admin/realms/finaxis/clients' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "clientId": "finaxis-web",
    "name": "Finaxis Web",
    "protocol": "openid-connect",
    "publicClient": false,
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": false,
    "redirectUris": [
      "http://localhost:3000/api/auth/oauth2/callback/keycloak",
      "http://localhost:3100/api/auth/oauth2/callback/keycloak"
    ],
    "webOrigins": [
      "http://localhost:3000",
      "http://localhost:3100"
    ],
    "attributes": {
      "pkce.code.challenge.method": "S256",
      "post.logout.redirect.uris": "http://localhost:3000/login##http://localhost:3100/login"
    }
  }'
```

Expected: empty response body, HTTP 201 (verify with `-w '%{http_code}\n'` if you want to see the status explicitly). Keycloak's Admin API encodes multiple post-logout redirect URIs separated by `##` in the `post.logout.redirect.uris` attribute — this is the documented Keycloak convention, not a typo.

- [ ] **Step 3: Capture the generated client secret**

Run:

```bash
CLIENT_UUID="$(curl -fsS "http://localhost:8080/admin/realms/finaxis/clients?clientId=finaxis-web" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"

CLIENT_SECRET="$(curl -fsS "http://localhost:8080/admin/realms/finaxis/clients/$CLIENT_UUID/client-secret" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["value"])')"

echo "Client UUID: $CLIENT_UUID"
echo "Client secret captured: ${#CLIENT_SECRET} chars"
```

Expected: both values print with non-zero lengths. **Write `CLIENT_SECRET`'s literal value down now** — Task 2 needs it for `.env.local`, and it is not retrievable in plaintext from the realm export file (Keycloak stores a hash, not the plaintext secret, once you fetch it — the `/client-secret` GET endpoint above is what actually returns the plaintext value each time it's called, so you can re-run it later if needed).

- [ ] **Step 4: Verify the client accepts the discovery/authorization endpoint shape**

Run:

```bash
curl -fsS "http://localhost:8080/realms/finaxis/.well-known/openid-configuration" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["authorization_endpoint"]); print(d["end_session_endpoint"])'
```

Expected: two URLs print, both under `http://localhost:8080/realms/finaxis/protocol/openid-connect/...`. Note the exact `end_session_endpoint` value — Task 23 (logout) constructs a redirect to it.

- [ ] **Step 5: Persist the client into the realm export for durability**

Read `/home/ogaba/finaxis/platform/docker/keycloak/import/finaxis-realm.json`, find the `clients` array, and append an entry matching what was just created, so a clean `--import-realm` recreates it identically:

```json
{
  "clientId": "finaxis-web",
  "name": "Finaxis Web",
  "protocol": "openid-connect",
  "publicClient": false,
  "secret": "<CLIENT_SECRET captured in Step 3 — this file is local-dev-only, never committed to a production config>",
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "redirectUris": [
    "http://localhost:3000/api/auth/oauth2/callback/keycloak",
    "http://localhost:3100/api/auth/oauth2/callback/keycloak"
  ],
  "webOrigins": ["http://localhost:3000", "http://localhost:3100"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:3000/login##http://localhost:3100/login"
  }
}
```

Use the `Edit` tool (or `python3 -c` with `json.load`/`json.dump`, preserving key order and indentation of the existing file) to insert this object into the `clients` array alongside the existing `finaxis-platform` entry. Do not modify `finaxis-platform`.

- [ ] **Step 6: Commit the cross-repo change**

Run (from `/home/ogaba/finaxis/platform`):

```bash
cd /home/ogaba/finaxis/platform
git status
git add docker/keycloak/import/finaxis-realm.json
git commit -m "$(cat <<'EOF'
feat: add finaxis-web confidential OIDC client for the frontend

Adds the browser-facing Better Auth client alongside the existing
finaxis-platform backend client, so a clean realm import stays in
sync with the client created via the Admin API for local dev.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds. This is a separate repo from `finaxis-frontend` — do not `cd` back and forth carelessly; return to `/home/ogaba/finaxis/finaxis-frontend` for Task 2.

---

### Task 2: Install dependencies and add validated server environment config

**Files:**

- Modify: `package.json`
- Create: `.env.example`
- Create: `.env.local` (gitignored — real secret from Task 1)
- Create: `config/env.server.ts`
- Test: `config/env.server.test.ts`

**Interfaces:**

- Produces: `serverEnv` (typed object) with fields `NODE_ENV`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_TRUSTED_ORIGINS: string[]`, `AUTH_POST_LOGOUT_REDIRECT_URI` — every later server-side auth task imports this.

- [ ] **Step 1: Install `better-auth` and `server-only`**

Run:

```bash
pnpm add better-auth@1.6.23 server-only
```

Expected: `package.json` gains both under `dependencies`; lockfile updates.

- [ ] **Step 2: Generate a real Better Auth secret**

Run:

```bash
openssl rand -base64 48
```

Expected: a 64-character base64 string prints. Copy it for Step 4.

- [ ] **Step 3: Write `.env.example`**

```dotenv
# Public application origin. No trailing slash.
# This environment's dev server runs on 3100 (see .env.local) because the
# platform's grafana-lgtm container holds port 3000 — 3000 is the portable
# canonical example for environments without that conflict.
BETTER_AUTH_URL=http://localhost:3000

# Generate with a cryptographically secure command such as:
# openssl rand -base64 48
BETTER_AUTH_SECRET=

# Keycloak realm issuer, for example:
# https://identity.example.com/realms/finaxis
KEYCLOAK_ISSUER=

KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=

# Comma-separated exact application origins where needed. No wildcards.
AUTH_TRUSTED_ORIGINS=http://localhost:3000

# Post-logout destination. Must belong to a trusted origin.
AUTH_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/login
```

- [ ] **Step 4: Write `.env.local`** (gitignored — verify with `git check-ignore .env.local` after)

```dotenv
BETTER_AUTH_URL=http://localhost:3100
BETTER_AUTH_SECRET=<the openssl output from Step 2>
KEYCLOAK_ISSUER=http://localhost:8080/realms/finaxis
KEYCLOAK_CLIENT_ID=finaxis-web
KEYCLOAK_CLIENT_SECRET=<the CLIENT_SECRET captured in Task 1 Step 3>
AUTH_TRUSTED_ORIGINS=http://localhost:3100
AUTH_POST_LOGOUT_REDIRECT_URI=http://localhost:3100/login
```

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (confirms it's ignored, matching the repo's existing `.env*` / `!.env.example` gitignore rule).

- [ ] **Step 5: Write the failing test for `config/env.server.ts`**

```ts
// config/env.server.test.ts
import { describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  NODE_ENV: 'development',
  BETTER_AUTH_URL: 'http://localhost:3100',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
  KEYCLOAK_CLIENT_ID: 'finaxis-web',
  KEYCLOAK_CLIENT_SECRET: 'secret-value',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3100',
  AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3100/login',
};

async function loadEnvServerWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const original = { ...process.env };
  for (const [key, value] of Object.entries({ ...REQUIRED_ENV, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await import('./env.server');
  } finally {
    process.env = original;
  }
}

describe('serverEnv', () => {
  it('parses a valid, minimal development configuration', async () => {
    const { serverEnv } = await loadEnvServerWith({});
    expect(serverEnv.BETTER_AUTH_URL).toBe('http://localhost:3100');
    expect(serverEnv.AUTH_TRUSTED_ORIGINS).toEqual(['http://localhost:3100']);
  });

  it('splits and trims comma-separated trusted origins', async () => {
    const { serverEnv } = await loadEnvServerWith({
      AUTH_TRUSTED_ORIGINS: 'http://localhost:3100, http://localhost:3000',
    });
    expect(serverEnv.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://localhost:3100',
      'http://localhost:3000',
    ]);
  });

  it('throws when a required variable is missing', async () => {
    await expect(loadEnvServerWith({ BETTER_AUTH_SECRET: undefined })).rejects.toThrow(
      /Invalid server environment configuration/,
    );
  });

  it('throws when BETTER_AUTH_SECRET is shorter than 32 characters', async () => {
    await expect(loadEnvServerWith({ BETTER_AUTH_SECRET: 'short' })).rejects.toThrow(
      /Invalid server environment configuration/,
    );
  });

  it('rejects a wildcard trusted origin', async () => {
    await expect(
      loadEnvServerWith({ AUTH_TRUSTED_ORIGINS: 'https://*.finaxis.example' }),
    ).rejects.toThrow(/wildcard/);
  });

  it('rejects a post-logout redirect URI outside the trusted origins', async () => {
    await expect(
      loadEnvServerWith({ AUTH_POST_LOGOUT_REDIRECT_URI: 'http://evil.example/login' }),
    ).rejects.toThrow(/trusted origin/);
  });

  it('requires HTTPS origins in production', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'http://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'http://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'http://app.finaxis.example/login',
      }),
    ).rejects.toThrow(/HTTPS/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run config/env.server.test.ts`
Expected: FAIL — `Cannot find module './env.server'`.

- [ ] **Step 7: Write `config/env.server.ts`**

```ts
import 'server-only';
import { z } from 'zod';

const trustedOriginsSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.url()).min(1, 'At least one trusted origin is required.'));

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.'),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  AUTH_TRUSTED_ORIGINS: trustedOriginsSchema,
  AUTH_POST_LOGOUT_REDIRECT_URI: z.url(),
});

export type ServerEnv = z.infer<typeof rawServerEnvSchema>;

function originOf(url: string): string {
  return new URL(url).origin;
}

function assertNoWildcardOrigins(origins: readonly string[]): void {
  const wildcard = origins.find((origin) => origin.includes('*'));
  if (wildcard) {
    throw new Error(`AUTH_TRUSTED_ORIGINS must not contain wildcard origins; got "${wildcard}".`);
  }
}

function assertHttpsInProduction(env: ServerEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const candidates = [
    env.BETTER_AUTH_URL,
    env.AUTH_POST_LOGOUT_REDIRECT_URI,
    ...env.AUTH_TRUSTED_ORIGINS,
  ];
  const insecure = candidates.find((url) => !url.startsWith('https://'));
  if (insecure) {
    throw new Error(`Production requires HTTPS origins; got "${insecure}".`);
  }
}

function assertPostLogoutRedirectIsTrusted(env: ServerEnv): void {
  const trustedOrigins = new Set([
    originOf(env.BETTER_AUTH_URL),
    ...env.AUTH_TRUSTED_ORIGINS.map(originOf),
  ]);
  const postLogoutOrigin = originOf(env.AUTH_POST_LOGOUT_REDIRECT_URI);
  if (!trustedOrigins.has(postLogoutOrigin)) {
    throw new Error(
      `AUTH_POST_LOGOUT_REDIRECT_URI (${postLogoutOrigin}) must belong to a trusted origin.`,
    );
  }
}

function parseServerEnv(): ServerEnv {
  const parsed = rawServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration: ${parsed.error.message}`);
  }

  assertNoWildcardOrigins(parsed.data.AUTH_TRUSTED_ORIGINS);
  assertHttpsInProduction(parsed.data);
  assertPostLogoutRedirectIsTrusted(parsed.data);

  return parsed.data;
}

export const serverEnv = parseServerEnv();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run config/env.server.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example config/env.server.ts config/env.server.test.ts .gitignore
git commit -m "$(cat <<'EOF'
feat: add better-auth dependency and validated server env config

Zod-validates BETTER_AUTH_*/KEYCLOAK_*/AUTH_* at import time, rejecting
missing values, wildcard trusted origins, an untrusted post-logout
redirect, and non-HTTPS origins in production.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note: `.env.local` is intentionally not staged (gitignored). Verify with `git status` that it does not appear.

---

### Task 3: Auth types and the claim-mapping boundary

**Files:**

- Create: `auth/auth.types.ts`
- Create: `auth/map-authenticated-user.ts`
- Test: `auth/map-authenticated-user.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `FinaxisUser`, `AssignedBranch`, `OrganizationSummary` types, and `mapAuthenticatedUser(input: MapAuthenticatedUserInput): FinaxisUser` — Task 7 (`get-authenticated-user.ts`) and every shell/profile component consuming user data import these.

- [ ] **Step 1: Write `auth/auth.types.ts`**

```ts
export interface AssignedBranch {
  id: string;
  name: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
}

export interface FinaxisUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  image?: string;
  roles: readonly string[];
  branches: readonly AssignedBranch[];
  organization?: OrganizationSummary;
}
```

- [ ] **Step 2: Write the failing test for `map-authenticated-user.ts`**

```ts
// auth/map-authenticated-user.test.ts
import { describe, expect, it } from 'vitest';
import { mapAuthenticatedUser } from './map-authenticated-user';

describe('mapAuthenticatedUser', () => {
  it('maps a well-formed session user to a FinaxisUser with empty roles and branches', () => {
    const result = mapAuthenticatedUser({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      image: null,
    });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      username: undefined,
      image: undefined,
      roles: [],
      branches: [],
      organization: undefined,
    });
  });

  it('carries the image through when present', () => {
    const result = mapAuthenticatedUser({
      id: 'user-2',
      name: 'Kevin Otieno',
      email: 'kevin.otieno@finaxis.test',
      image: 'https://cdn.finaxis.test/avatars/kevin.png',
    });

    expect(result.image).toBe('https://cdn.finaxis.test/avatars/kevin.png');
  });

  it('falls back to an empty name rather than throwing when name is blank', () => {
    const result = mapAuthenticatedUser({
      id: 'user-3',
      name: '',
      email: 'no-name@finaxis.test',
      image: null,
    });

    expect(result.name).toBe('');
    expect(result.roles).toEqual([]);
    expect(result.branches).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run auth/map-authenticated-user.test.ts`
Expected: FAIL — `Cannot find module './map-authenticated-user'`.

- [ ] **Step 4: Write `auth/map-authenticated-user.ts`**

```ts
import type { FinaxisUser } from './auth.types';

export interface MapAuthenticatedUserInput {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * Maps only validated Better Auth session fields to the application-facing
 * FinaxisUser shape. Keycloak does not yet emit role/branch/organization
 * claims, so those are always empty/undefined here rather than fabricated —
 * see docs/authentication/keycloak.md for the claim-mapping plan.
 */
export function mapAuthenticatedUser(input: MapAuthenticatedUserInput): FinaxisUser {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    username: undefined,
    image: input.image ?? undefined,
    roles: [],
    branches: [],
    organization: undefined,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run auth/map-authenticated-user.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add auth/auth.types.ts auth/map-authenticated-user.ts auth/map-authenticated-user.test.ts
git commit -m "$(cat <<'EOF'
feat: add FinaxisUser type and the claim-mapping boundary

Isolates raw session-claim handling behind one function so the shell
and profile page never touch Better Auth's session shape directly,
and so absent role/branch/organization claims render as empty rather
than fabricated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Better Auth server instance

**Files:**

- Create: `auth/auth.ts`

**Interfaces:**

- Consumes: `serverEnv` from `config/env.server.ts` (Task 2).
- Produces: `auth` (the `betterAuth()` instance) — Task 5 (route handler), Task 7 (`get-authenticated-user.ts`), Task 11 ((authenticated) layout), and Task 23 (logout route) all import this.

This task has no unit test of its own — `auth.ts` is a thin, mostly-declarative config object exercised end-to-end by later tasks (the route handler smoke test in Task 5, the session-guard test in Task 11, and the E2E suite). Verification here is a manual `pnpm build` type-check pass plus the discovery-endpoint reachability check already done in Task 1.

- [ ] **Step 1: Write `auth/auth.ts`**

```ts
import 'server-only';
import { betterAuth } from 'better-auth';
import { genericOAuth, keycloak } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { serverEnv } from '@/config/env.server';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 8; // 8 hours — conservative for an enterprise finance system.

export const auth = betterAuth({
  appName: 'Finaxis',
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  trustedOrigins: serverEnv.AUTH_TRUSTED_ORIGINS,

  // No `database` key: sessions are stateless, cached entirely in an
  // encrypted cookie. See docs/authentication/stateless-sessions.md for the
  // trade-offs (no central revocation short of a cookieCache version bump).
  session: {
    expiresIn: SESSION_LIFETIME_SECONDS,
    cookieCache: {
      enabled: true,
      strategy: 'jwe',
      maxAge: SESSION_LIFETIME_SECONDS,
      refreshCache: true,
      version: '1',
    },
  },

  account: {
    storeStateStrategy: 'cookie',
    storeAccountCookie: true,
    encryptOAuthTokens: true,
  },

  advanced: {
    cookiePrefix: 'finaxis',
    useSecureCookies: serverEnv.NODE_ENV === 'production',
  },

  rateLimit: {
    enabled: serverEnv.NODE_ENV === 'production',
    window: 60,
    max: 30,
    customRules: {
      // Paths are relative to the /api/auth mount point.
      '/oauth2/callback/keycloak': { window: 60, max: 10 },
      '/sign-out': { window: 60, max: 10 },
    },
  },

  plugins: [
    genericOAuth({
      config: [
        keycloak({
          providerId: 'keycloak',
          clientId: serverEnv.KEYCLOAK_CLIENT_ID,
          clientSecret: serverEnv.KEYCLOAK_CLIENT_SECRET,
          issuer: serverEnv.KEYCLOAK_ISSUER,
          scopes: ['openid', 'profile', 'email'],
          pkce: true,
          requireIssuerValidation: true,
        }),
      ],
    }),
    // Must be last: lets auth.api.* calls (e.g. the custom logout route in
    // Task 23) set/clear cookies via next/headers when called outside
    // toNextJsHandler's own request/response cycle.
    nextCookies(),
  ],
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: no errors. If `keycloak`/`genericOAuth` fail to resolve from `better-auth/plugins`, inspect `node_modules/better-auth/package.json`'s `exports` map (confirmed during design research to include a `./plugins` subpath) and adjust the import path accordingly — do not guess further, read the installed package.

- [ ] **Step 3: Commit**

```bash
git add auth/auth.ts
git commit -m "$(cat <<'EOF'
feat: configure stateless Better Auth server instance for Keycloak

No database — sessions are cached in an encrypted (jwe) cookie, 8h
lifetime, CSRF/origin checks left at their secure defaults, OAuth
tokens encrypted at rest in the account cookie.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Better Auth Next.js route handler

**Files:**

- Create: `app/api/auth/[...all]/route.ts`

**Interfaces:**

- Consumes: `auth` from `auth/auth.ts` (Task 4).
- Produces: the live `/api/auth/*` HTTP surface (discovery redirect, `/api/auth/oauth2/callback/keycloak`, `/api/auth/get-session`, `/api/auth/sign-out`, etc.) that Task 6's client and Task 11's layout guard talk to.

- [ ] **Step 1: Write `app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/auth/auth';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 2: Verify the route is live**

Run:

```bash
PORT=3100 pnpm dev &
sleep 3
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/auth/get-session
kill %1
```

Expected: prints `200` (an unauthenticated `get-session` call returns `200` with a `null` body in Better Auth, not a `401`).

- [ ] **Step 3: Commit**

```bash
git add "app/api/auth/[...all]/route.ts"
git commit -m "$(cat <<'EOF'
feat: mount the Better Auth route handler at /api/auth

Uses Better Auth's official toNextJsHandler — same-origin, no custom
CORS headers, since the frontend is the only intended client.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Better Auth browser client

**Files:**

- Create: `auth/auth-client.ts`

**Interfaces:**

- Consumes: nothing server-side (browser-safe module, no secrets).
- Produces: `authClient` with `authClient.signIn.oauth2(...)` and `authClient.signOut(...)` — Task 12 (login button) and Task 15 (user menu) import this.

- [ ] **Step 1: Write `auth/auth-client.ts`**

```ts
'use client';

import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: no errors — `createAuthClient` infers its base URL from the current origin by default (same-origin `/api/auth`), so no `baseURL` option is needed here.

- [ ] **Step 3: Commit**

```bash
git add auth/auth-client.ts
git commit -m "$(cat <<'EOF'
feat: add the browser-safe Better Auth client

Same-origin, no secrets, no manually managed token storage — only
used for initiating sign-in and sign-out from Client Components.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Server-side authenticated-user helper

**Files:**

- Create: `auth/get-authenticated-user.ts`
- Test: `auth/get-authenticated-user.test.ts`

**Interfaces:**

- Consumes: `auth` (Task 4), `mapAuthenticatedUser` (Task 3).
- Produces: `getAuthenticatedUser(headers: Headers): Promise<FinaxisUser | null>` — Task 11 ((authenticated) layout), Task 16 (profile page), and Task 15 (user menu, via the layout) all rely on this being the single place that calls `auth.api.getSession` and maps the result.

- [ ] **Step 1: Write the failing test**

```ts
// auth/get-authenticated-user.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const { auth } = await import('./auth');
const { getAuthenticatedUser } = await import('./get-authenticated-user');

describe('getAuthenticatedUser', () => {
  it('returns null when there is no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const result = await getAuthenticatedUser(new Headers());

    expect(result).toBeNull();
  });

  it('maps a present session to a FinaxisUser', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      session: { id: 'session-1', userId: 'user-1' },
      user: {
        id: 'user-1',
        name: 'Amina Yusuf',
        email: 'amina.yusuf@finaxis.test',
        image: null,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // biome-ignore-next-line: mocked shape only needs the fields the helper reads
    } as never);

    const result = await getAuthenticatedUser(new Headers());

    expect(result).toEqual({
      id: 'user-1',
      name: 'Amina Yusuf',
      email: 'amina.yusuf@finaxis.test',
      username: undefined,
      image: undefined,
      roles: [],
      branches: [],
      organization: undefined,
    });
  });
});
```

Replace the `// biome-ignore-next-line` comment above with nothing if it trips the linter — it is only a placeholder note for the plan author's context and must not be committed literally; the actual file should just have the `} as never);` cast on its own, since the test directory's ESLint override already disables `no-unsafe-assignment`/`no-unsafe-member-access` (see `eslint.config.mjs`) for exactly this kind of test fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run auth/get-authenticated-user.test.ts`
Expected: FAIL — `Cannot find module './get-authenticated-user'`.

- [ ] **Step 3: Write `auth/get-authenticated-user.ts`**

```ts
import 'server-only';
import { auth } from './auth';
import { mapAuthenticatedUser } from './map-authenticated-user';
import type { FinaxisUser } from './auth.types';

export async function getAuthenticatedUser(headers: Headers): Promise<FinaxisUser | null> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    return null;
  }

  return mapAuthenticatedUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run auth/get-authenticated-user.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add auth/get-authenticated-user.ts auth/get-authenticated-user.test.ts
git commit -m "$(cat <<'EOF'
feat: add the single server-side session-to-FinaxisUser helper

Every protected layout and page reads the session through this one
function rather than calling auth.api.getSession directly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Typed application context fixture

**Files:**

- Create: `config/application-context.ts`

**Interfaces:**

- Produces: `ApplicationContext` type and `applicationContext` fixture value (`module`/`organization`/`branch`) — Task 14 (global header) and Task 17 (organization context provider) import this.

- [ ] **Step 1: Write `config/application-context.ts`**

```ts
export interface ApplicationContextModule {
  id: string;
  name: string;
}

export interface ApplicationContextOrganization {
  id: string;
  name: string;
}

export interface ApplicationContextBranch {
  id: string;
  name: string;
}

export interface ApplicationContext {
  module: ApplicationContextModule;
  organization: ApplicationContextOrganization;
  branch: ApplicationContextBranch;
}

/**
 * Stand-in for the future organization/branch-selection flow. Branch and
 * organization resolution isn't implemented yet — this fixture unblocks the
 * shell's header/context UI until a real selection API exists. Never
 * treat this as authoritative for authorization.
 */
export const applicationContext: ApplicationContext = {
  module: {
    id: 'administration',
    name: 'Administration',
  },
  organization: {
    id: 'greenfield-sacco',
    name: 'GreenField SACCO',
  },
  branch: {
    id: 'nairobi-central',
    name: 'Nairobi Central Branch',
  },
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add config/application-context.ts
git commit -m "$(cat <<'EOF'
feat: add the typed application-context fixture

Hardcoded module/organization/branch stand-in, isolated behind a
typed module so the real selection API can replace only this file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Replace the mock login with real Keycloak sign-in

**Files:**

- Create: `app/(public)/login/page.tsx`
- Delete: `app/(auth)/login/page.tsx` (moved, not duplicated)
- Create: `components/auth/continue-with-keycloak-button.tsx`
- Test: `components/auth/continue-with-keycloak-button.test.tsx`
- Create: `components/auth/login-status-alert.tsx`
- Test: `components/auth/login-status-alert.test.tsx`
- Delete: `components/auth/login-form.tsx`, `components/auth/login-form.schema.ts`, `components/auth/login-form.test.tsx`
- Delete: `components/auth/mock-authenticate.ts`, `components/auth/mock-authenticate.test.ts`
- Modify: `e2e/login.spec.ts` (remove mock-form assertions, add real-button assertions)

**Interfaces:**

- Consumes: `authClient` from `auth/auth-client.ts` (Task 6).
- Produces: the `/login` route other tasks redirect to (`(authenticated)/layout.tsx` in Task 11, `proxy.ts` in Task 10).

- [ ] **Step 1: Write the failing test for the button**

```tsx
// components/auth/continue-with-keycloak-button.test.tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const signInOauth2 = vi.fn();

vi.mock('@/auth/auth-client', () => ({
  authClient: {
    signIn: {
      oauth2: (...args: unknown[]) =>
        signInOauth2(...args) as Promise<{ error?: { message: string } }>,
    },
  },
}));

const { ContinueWithKeycloakButton } = await import('./continue-with-keycloak-button');

describe('ContinueWithKeycloakButton', () => {
  it('initiates Keycloak OAuth sign-in with the correct provider id and destinations', async () => {
    signInOauth2.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    await user.click(screen.getByRole('button', { name: /continue to finaxis/i }));

    expect(signInOauth2).toHaveBeenCalledWith({
      providerId: 'keycloak',
      callbackURL: '/admin',
      errorCallbackURL: '/login?error=authentication_failed',
    });
  });

  it('disables the button and shows a loading label while redirecting', async () => {
    let resolveSignIn: (value: { error?: undefined }) => void = () => undefined;
    signInOauth2.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    const button = screen.getByRole('button', { name: /continue to finaxis/i });
    await user.click(button);

    expect(screen.getByRole('button', { name: /redirecting/i })).toBeDisabled();
    resolveSignIn({ error: undefined });
  });

  it('prevents a second submission while a redirect is in flight', async () => {
    signInOauth2.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves within this test */
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    const button = screen.getByRole('button', { name: /continue to finaxis/i });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: /redirecting/i }));

    expect(signInOauth2).toHaveBeenCalledTimes(1);
  });

  it('shows an accessible error message when sign-in fails to start', async () => {
    signInOauth2.mockResolvedValueOnce({ error: { message: 'network error' } });
    const user = userEvent.setup();
    renderWithProviders(<ContinueWithKeycloakButton />);

    await user.click(screen.getByRole('button', { name: /continue to finaxis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't start the sign-in/i);
    expect(screen.getByRole('button', { name: /continue to finaxis/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/auth/continue-with-keycloak-button.test.tsx`
Expected: FAIL — `Cannot find module './continue-with-keycloak-button'`.

- [ ] **Step 3: Write `components/auth/continue-with-keycloak-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { authClient } from '@/auth/auth-client';

export function ContinueWithKeycloakButton() {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleClick = async () => {
    if (isRedirecting) {
      return;
    }
    setIsRedirecting(true);
    setHasError(false);

    const { error } = await authClient.signIn.oauth2({
      providerId: 'keycloak',
      callbackURL: '/admin',
      errorCallbackURL: '/login?error=authentication_failed',
    });

    if (error) {
      setHasError(true);
      setIsRedirecting(false);
    }
  };

  return (
    <Stack spacing={2}>
      {hasError && (
        <Alert severity="error" role="alert" variant="outlined">
          We couldn&apos;t start the sign-in process. Please try again.
        </Alert>
      )}
      <Button
        type="button"
        variant="contained"
        size="large"
        fullWidth
        disabled={isRedirecting}
        startIcon={isRedirecting ? <CircularProgress size={18} color="inherit" /> : undefined}
        onClick={() => {
          void handleClick();
        }}
      >
        {isRedirecting ? 'Redirecting…' : 'Continue to Finaxis'}
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        You will be redirected to your organization&apos;s secure identity service.
      </Typography>
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/auth/continue-with-keycloak-button.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for the status alert**

```tsx
// components/auth/login-status-alert.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { LoginStatusAlert } from './login-status-alert';

describe('LoginStatusAlert', () => {
  it('renders nothing when there is no error or reason', () => {
    renderWithProviders(<LoginStatusAlert />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a generic message for authentication_failed without protocol details', () => {
    renderWithProviders(<LoginStatusAlert error="authentication_failed" />);
    const alert = screen.getByRole('status');
    expect(alert).toHaveTextContent(/couldn't sign you in/i);
    expect(alert).not.toHaveTextContent(/oauth|token|keycloak/i);
  });

  it('renders a session-expired message', () => {
    renderWithProviders(<LoginStatusAlert reason="session_expired" />);
    expect(screen.getByRole('status')).toHaveTextContent(/session has expired/i);
  });

  it('renders a logged-out message', () => {
    renderWithProviders(<LoginStatusAlert reason="logged_out" />);
    expect(screen.getByRole('status')).toHaveTextContent(/signed out/i);
  });

  it('ignores an unrecognized reason rather than showing a blank alert', () => {
    renderWithProviders(<LoginStatusAlert reason="something_unexpected" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run components/auth/login-status-alert.test.tsx`
Expected: FAIL — `Cannot find module './login-status-alert'`.

- [ ] **Step 7: Write `components/auth/login-status-alert.tsx`**

```tsx
'use client';

import Alert from '@mui/material/Alert';

const STATUS_MESSAGES: Record<string, string> = {
  'error:authentication_failed': 'We couldn’t sign you in. Please try again.',
  'reason:session_expired': 'Your session has expired. Please sign in again.',
  'reason:logged_out': 'You have been signed out.',
};

interface LoginStatusAlertProps {
  error?: string;
  reason?: string;
}

export function LoginStatusAlert({ error, reason }: LoginStatusAlertProps) {
  const key = error ? `error:${error}` : reason ? `reason:${reason}` : undefined;
  const message = key ? STATUS_MESSAGES[key] : undefined;

  if (!message) {
    return null;
  }

  return (
    <Alert severity={reason === 'logged_out' ? 'info' : 'warning'} role="status" sx={{ mb: 3 }}>
      {message}
    </Alert>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run components/auth/login-status-alert.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 9: Move the login page into `(public)` and wire the new components**

Run: `mkdir -p "app/(public)" && git mv "app/(auth)/login" "app/(public)/login" && rmdir "app/(auth)" 2>/dev/null; true`

Then rewrite `app/(public)/login/page.tsx`'s imports and body: replace the `LoginForm` import/usage with `ContinueWithKeycloakButton` and `LoginStatusAlert`, and make the component `async` to read `searchParams`. Keep the brand panel, mobile header, `ThemeModeToggle`, and support/legal links exactly as they are today — only the authentication-panel content changes:

```tsx
import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';

import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import { ProductFeature } from '@/components/branding/product-feature';
import { ThemeModeToggle } from '@/components/providers/theme-mode-toggle';
import { ContinueWithKeycloakButton } from '@/components/auth/continue-with-keycloak-button';
import { LoginStatusAlert } from '@/components/auth/login-status-alert';

export const metadata: Metadata = {
  title: 'Sign in',
};

const CAPABILITIES = [
  { icon: GroupsOutlined, label: 'Membership' },
  { icon: SavingsOutlined, label: 'Savings' },
  { icon: PaymentsOutlined, label: 'Loans' },
  { icon: CalculateOutlined, label: 'Accounting' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[]; reason?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const error = firstParam(resolvedParams.error);
  const reason = firstParam(resolvedParams.reason);

  return (
    <Box className="flex min-h-dvh w-full flex-col overflow-x-hidden md:flex-row">
      {/* Compact brand header, mobile only */}
      <Box
        component="header"
        className="flex items-center gap-3 px-6 py-6 md:hidden"
        sx={{ bgcolor: 'brand.navy', color: 'brand.onNavy' }}
      >
        <FinaxisLogo size={36} />
        <Box>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, color: 'inherit', lineHeight: 1.2 }}
          >
            Finaxis
          </Typography>
          <Typography variant="caption" sx={{ color: 'brand.onNavyMuted' }}>
            Financial operations for member-based institutions.
          </Typography>
        </Box>
      </Box>

      {/* Brand panel, desktop only */}
      <Box
        component="aside"
        aria-label="About Finaxis"
        className="finaxis-brand-backdrop relative hidden flex-col justify-between overflow-hidden px-12 py-12 md:flex md:w-[52%]"
        sx={{ bgcolor: 'brand.navy', color: 'brand.onNavy' }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', position: 'relative' }}>
          <FinaxisLogo />
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'inherit' }}>
            Finaxis
          </Typography>
        </Stack>

        <Box sx={{ maxWidth: 480, position: 'relative' }}>
          <Typography variant="overline" sx={{ color: 'brand.onNavyAccent', letterSpacing: 1.2 }}>
            SACCO core banking platform
          </Typography>
          <Typography
            component="p"
            variant="h3"
            sx={{ fontWeight: 700, mt: 1, mb: 2, color: 'inherit' }}
          >
            Financial operations, built around your members.
          </Typography>
          <Typography variant="body1" sx={{ color: 'brand.onNavyMuted' }}>
            Manage membership, savings, loans and accounting through one secure and connected SACCO
            platform.
          </Typography>
        </Box>

        <Box
          className="grid grid-cols-2 gap-3"
          sx={{ position: 'relative' }}
          aria-label="Platform capabilities"
        >
          {CAPABILITIES.map((capability) => (
            <ProductFeature
              key={capability.label}
              icon={capability.icon}
              label={capability.label}
            />
          ))}
        </Box>
      </Box>

      {/* Authentication panel */}
      <Box
        component="main"
        className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8 md:w-[48%]"
      >
        <Box className="flex w-full justify-end" sx={{ maxWidth: 440, mb: 3 }}>
          <ThemeModeToggle />
        </Box>

        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Welcome back
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            Sign in to access your Finaxis workspace.
          </Typography>

          <LoginStatusAlert error={error} reason={reason} />
          <ContinueWithKeycloakButton />

          <Stack spacing={1} sx={{ alignItems: 'center', mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Need help? <MuiLink href="mailto:support@finaxis.io">Contact support</MuiLink>
            </Typography>
            <Stack direction="row" spacing={2}>
              <MuiLink href="/legal/terms" variant="caption" color="text.secondary">
                Terms of service
              </MuiLink>
              <MuiLink href="/legal/privacy" variant="caption" color="text.secondary">
                Privacy policy
              </MuiLink>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 10: Remove the obsolete mock-auth files**

Run:

```bash
git rm components/auth/login-form.tsx components/auth/login-form.schema.ts components/auth/login-form.test.tsx
git rm components/auth/mock-authenticate.ts components/auth/mock-authenticate.test.ts
```

- [ ] **Step 11: Update `e2e/login.spec.ts`**

Replace the mock-form-specific tests (`'shows a mock-auth result on valid submission'`, `'shows a generic error for the locked demo account'`, `'shows required-field validation errors'`, the `'can show and hide the password'` password-visibility test, and the keyboard-navigation test that types credentials) with assertions against the real button. Full replacement file:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Login page', () => {
  test('redirects from the root route to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('displays Finaxis branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'About Finaxis' }).getByText('Finaxis'),
    ).toBeVisible();
  });

  test('shows the Continue to Finaxis action and no password field', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue to Finaxis' })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  test('shows a generic message for a failed-authentication redirect', async ({ page }) => {
    await page.goto('/login?error=authentication_failed');
    await expect(page.getByRole('status')).toContainText(/couldn't sign you in/i);
  });

  test('shows a generic message for an expired-session redirect', async ({ page }) => {
    await page.goto('/login?reason=session_expired');
    await expect(page.getByRole('status')).toContainText(/session has expired/i);
  });

  test('shows a generic message after logging out', async ({ page }) => {
    await page.goto('/login?reason=logged_out');
    await expect(page.getByRole('status')).toContainText(/signed out/i);
  });

  test('works at mobile viewport widths without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('works at desktop viewport widths and shows the brand panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'About Finaxis' })).toBeVisible();
  });

  test('renders light and dark color schemes', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Light mode' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);

    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).analyze();

    const seriousOrCritical = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );

    expect(seriousOrCritical).toEqual([]);
  });
});
```

- [ ] **Step 12: Run the full unit suite and lint**

Run: `pnpm check`
Expected: clean — no leftover references to `mockAuthenticate`, `LoginForm`, or `loginFormSchema` anywhere (`grep -rn "mock-authenticate\|login-form" app components test e2e` should return nothing).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: replace mock login with real Keycloak sign-in

Moves the login route to app/(public)/login, removes the mock-auth
module and password form, and adds a single "Continue to Finaxis"
action that starts Better Auth's Keycloak OAuth flow, plus generic
status messages for the auth_failed/session_expired/logged_out
redirect states.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Optimistic proxy redirect

**Files:**

- Create: `proxy.ts`

**Interfaces:**

- Consumes: `getSessionCookie` from `better-auth/next-js`'s companion `better-auth/cookies` module (no dependency on `auth.ts`/`serverEnv` — deliberately lightweight, matching "Proxy must not perform slow backend calls").
- Produces: nothing other tasks import — this only affects request routing.

This task has no unit test (Proxy runs outside Vitest's jsdom environment) — it's exercised by the E2E redirect tests in Task 25.

- [ ] **Step 1: Write `proxy.ts`**

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PROTECTED_PREFIXES = ['/admin', '/profile'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request, { cookiePrefix: 'finaxis' });
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!sessionCookie && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
  }

  if (sessionCookie && pathname === '/login') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/profile', '/login'],
};
```

If `getSessionCookie`'s second parameter's option key isn't `cookiePrefix`, check
`node_modules/better-auth/dist/cookies/index.d.mts` for the exact accepted shape and adjust —
this is the same "verify against the installed package" caveat as Task 4.

- [ ] **Step 2: Manually verify no redirect loop**

Run:

```bash
PORT=3100 pnpm dev &
sleep 3
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3100/admin
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3100/profile
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/login
kill %1
```

Expected: `/admin` and `/profile` both return a redirect (`307`/`308`) to `/login?reason=session_expired`; `/login` itself returns `200` (no session cookie present, so the second `if` never fires — no loop).

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "$(cat <<'EOF'
feat: add optimistic proxy redirect for /admin, /profile, and /login

Cookie-presence-only check per Next.js 16 Proxy guidance — never the
authorization boundary; every protected layout still validates the
session server-side.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Server-validated authenticated route guard

**Files:**

- Create: `app/(authenticated)/layout.tsx`
- Test: `app/(authenticated)/layout.test.tsx`

**Interfaces:**

- Consumes: `getAuthenticatedUser` (Task 7).
- Produces: the `(authenticated)` layout other route-group tasks (Task 20 admin layout, Task 24 profile page) render inside. This task renders `children` directly (no shell chrome yet) — Task 20 will wrap `children` with the `AppShell` built in Tasks 12–19.

- [ ] **Step 1: Write the failing test**

```tsx
// app/(authenticated)/layout.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

const getAuthenticatedUser = vi.fn();
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args) as unknown,
}));

const { default: AuthenticatedLayout } = await import('./layout');

describe('AuthenticatedLayout', () => {
  it('renders children when a session is present', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    });

    const ui = await AuthenticatedLayout({ children: <div>Protected content</div> });
    render(ui);

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to /login with reason=session_expired when there is no session', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(AuthenticatedLayout({ children: <div>Protected content</div> })).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run "app/(authenticated)/layout.test.tsx"`
Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 3: Write `app/(authenticated)/layout.tsx`**

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await headers());

  if (!user) {
    redirect('/login?reason=session_expired');
  }

  return children;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run "app/(authenticated)/layout.test.tsx"`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(authenticated)/layout.test.tsx"
git add "app/(authenticated)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat: add the authoritative server-side session guard

Every route under (authenticated) validates the session via
auth.api.getSession (through getAuthenticatedUser) before rendering —
proxy.ts's cookie check is optimistic only, never authorization.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Shell module registry and application switcher

**Files:**

- Create: `components/shell/shell.constants.ts`
- Create: `components/shell/app-switcher.tsx`
- Test: `components/shell/app-switcher.test.tsx`

**Interfaces:**

- Produces: `ApplicationModule` type and `APPLICATION_MODULES` array (imported directly by `app-switcher.tsx`, not passed as a prop — avoids the Server→Client function/JSX prop restriction since icons are `React.ElementType` values); `AppSwitcher` component — Task 17 (global header) renders this.

- [ ] **Step 1: Write `components/shell/shell.constants.ts`**

```ts
import type { ElementType } from 'react';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import Diversity3Outlined from '@mui/icons-material/Diversity3Outlined';
import QueryStatsOutlined from '@mui/icons-material/QueryStatsOutlined';

export interface ApplicationModule {
  id: string;
  label: string;
  description: string;
  href?: string;
  icon: ElementType;
  enabled: boolean;
}

export const APPLICATION_MODULES: readonly ApplicationModule[] = [
  {
    id: 'administration',
    label: 'Administration',
    description: 'Users, branches, roles, settings, and audit logs.',
    href: '/admin',
    icon: AdminPanelSettingsOutlined,
    enabled: true,
  },
  {
    id: 'membership',
    label: 'Membership',
    description: 'Coming later.',
    icon: GroupsOutlined,
    enabled: false,
  },
  {
    id: 'accounting-finance',
    label: 'Accounting & Finance',
    description: 'Coming later.',
    icon: CalculateOutlined,
    enabled: false,
  },
  {
    id: 'savings-shares',
    label: 'Savings & Shares',
    description: 'Coming later.',
    icon: SavingsOutlined,
    enabled: false,
  },
  {
    id: 'loans-credit',
    label: 'Loans & Credit',
    description: 'Coming later.',
    icon: PaymentsOutlined,
    enabled: false,
  },
  {
    id: 'payments-treasury',
    label: 'Payments & Treasury',
    description: 'Coming later.',
    icon: AccountBalanceOutlined,
    enabled: false,
  },
  {
    id: 'procurement',
    label: 'Procurement',
    description: 'Coming later.',
    icon: Inventory2Outlined,
    enabled: false,
  },
  {
    id: 'assets',
    label: 'Assets',
    description: 'Coming later.',
    icon: Inventory2Outlined,
    enabled: false,
  },
  {
    id: 'hr-payroll',
    label: 'HR & Payroll',
    description: 'Coming later.',
    icon: Diversity3Outlined,
    enabled: false,
  },
  {
    id: 'reports-analytics',
    label: 'Reports & Analytics',
    description: 'Coming later.',
    icon: QueryStatsOutlined,
    enabled: false,
  },
] as const;
```

- [ ] **Step 2: Write the failing test for `AppSwitcher`**

```tsx
// components/shell/app-switcher.test.tsx
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppSwitcher } from './app-switcher';

describe('AppSwitcher', () => {
  it('opens on click and shows Administration as active', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    await user.click(screen.getByRole('button', { name: /switch application/i }));

    const administration = screen.getByRole('menuitem', { name: /administration/i });
    expect(administration).toHaveAttribute('aria-disabled', 'false');
  });

  it('disables modules that are not yet available', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    await user.click(screen.getByRole('button', { name: /switch application/i }));

    const membership = screen.getByRole('menuitem', { name: /membership/i });
    expect(membership).toHaveAttribute('aria-disabled', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    const trigger = screen.getByRole('button', { name: /switch application/i });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run components/shell/app-switcher.test.tsx`
Expected: FAIL — `Cannot find module './app-switcher'`.

- [ ] **Step 4: Write `components/shell/app-switcher.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import NextLink from '@/components/navigation/next-link';
import { APPLICATION_MODULES } from './shell.constants';

export function AppSwitcher() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Switch application">
        <IconButton
          aria-label="Switch application"
          aria-controls={open ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <AppsOutlined />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { sx: { width: 320 } } }}
      >
        {APPLICATION_MODULES.map((applicationModule) => (
          <MenuItem
            key={applicationModule.id}
            component={applicationModule.enabled ? NextLink : 'div'}
            href={applicationModule.enabled ? applicationModule.href : undefined}
            disabled={!applicationModule.enabled}
            onClick={handleClose}
          >
            <ListItemIcon>
              <applicationModule.icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={applicationModule.label}
              secondary={
                applicationModule.enabled ? undefined : (
                  <Typography component="span" variant="caption" color="text.secondary">
                    Coming later
                  </Typography>
                )
              }
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run components/shell/app-switcher.test.tsx`
Expected: PASS, 3 tests. MUI's `Menu` restores focus to its anchor element on close by default, so the Escape-key focus-return assertion should pass without extra wiring; if it doesn't, add `disableRestoreFocus={false}` explicitly (it's already the default) and re-check the test's `trigger` query matches the actual rendered `IconButton`.

- [ ] **Step 6: Commit**

```bash
git add components/shell/shell.constants.ts components/shell/app-switcher.tsx components/shell/app-switcher.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the typed module registry and application switcher

Administration is the only enabled module; the rest render as
visibly disabled "Coming later" entries with no fake routes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Theme mode menu

**Files:**

- Create: `components/shell/theme-mode-menu.tsx`
- Test: `components/shell/theme-mode-menu.test.tsx`

**Interfaces:**

- Produces: `ThemeModeMenu` — Task 17 (global header) renders this. Distinct from the existing `components/providers/theme-mode-toggle.tsx` (kept as-is for the login page); this is a `Menu`-based control for the shell header per the spec's component list, both reading/writing the same MUI `useColorScheme` state.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shell/theme-mode-menu.test.tsx
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ThemeModeMenu } from './theme-mode-menu';

describe('ThemeModeMenu', () => {
  it('exposes System default, Light, and Dark options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeModeMenu />);

    await user.click(screen.getByRole('button', { name: /theme/i }));

    expect(screen.getByRole('menuitem', { name: /system default/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^light$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^dark$/i })).toBeInTheDocument();
  });

  it('marks the selected mode and updates the color scheme on selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeModeMenu />);

    await user.click(screen.getByRole('button', { name: /theme/i }));
    await user.click(screen.getByRole('menuitem', { name: /^dark$/i }));

    expect(document.documentElement).toHaveClass('dark');

    await user.click(screen.getByRole('button', { name: /theme/i }));
    expect(screen.getByRole('menuitem', { name: /^dark$/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/theme-mode-menu.test.tsx`
Expected: FAIL — `Cannot find module './theme-mode-menu'`.

- [ ] **Step 3: Write `components/shell/theme-mode-menu.tsx`**

```tsx
'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import { useColorScheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';

type ColorSchemeMode = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { value: ColorSchemeMode; label: string; icon: typeof LightModeOutlined }[] = [
  { value: 'system', label: 'System default', icon: SettingsBrightnessOutlined },
  { value: 'light', label: 'Light', icon: LightModeOutlined },
  { value: 'dark', label: 'Dark', icon: DarkModeOutlined },
];

const subscribeNever = () => () => undefined;

function useIsMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function ThemeModeMenu() {
  const { mode, setMode } = useColorScheme();
  const mounted = useIsMounted();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchorEl);
  const currentMode: ColorSchemeMode = mounted ? (mode ?? 'system') : 'system';

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Theme">
        <IconButton
          aria-label="Theme"
          aria-controls={open ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <SettingsBrightnessOutlined />
        </IconButton>
      </Tooltip>
      <Menu id={menuId} anchorEl={anchorEl} open={open} onClose={handleClose}>
        {MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={currentMode === option.value}
            aria-selected={currentMode === option.value}
            onClick={() => {
              setMode(option.value);
              handleClose();
            }}
          >
            <ListItemIcon>
              <option.icon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/theme-mode-menu.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/shell/theme-mode-menu.tsx components/shell/theme-mode-menu.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the shell header's theme mode menu

System default/Light/Dark via MUI's useColorScheme — no second theme
state system, shares state with the existing login-page toggle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Notification placeholder button

**Files:**

- Create: `components/shell/notification-button.tsx`
- Test: `components/shell/notification-button.test.tsx`

**Interfaces:**

- Produces: `NotificationButton` — Task 17 (global header) renders this.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shell/notification-button.test.tsx
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { NotificationButton } from './notification-button';

describe('NotificationButton', () => {
  it('shows a badge count and opens a popover with placeholder text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationButton />);

    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText(/notifications will appear here/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/notification-button.test.tsx`
Expected: FAIL — `Cannot find module './notification-button'`.

- [ ] **Step 3: Write `components/shell/notification-button.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';

const SAMPLE_BADGE_COUNT = 3;

export function NotificationButton() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverId = useId();
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label="Notifications"
          aria-controls={open ? popoverId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <Badge badgeContent={SAMPLE_BADGE_COUNT} color="error">
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        id={popoverId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, maxWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Notifications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Notifications will appear here once delivery is connected.
          </Typography>
        </Box>
      </Popover>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/notification-button.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add components/shell/notification-button.tsx components/shell/notification-button.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the notification placeholder button

Accessible IconButton + Badge + Popover with a static sample count;
no notification backend.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: User menu

**Files:**

- Create: `components/shell/user-menu.tsx`
- Test: `components/shell/user-menu.test.tsx`

**Interfaces:**

- Consumes: `FinaxisUser` (Task 3).
- Produces: `UserMenu` — Task 17 (global header) renders this, receiving the `FinaxisUser` from the server layout as a plain serializable prop.

Logout must be a genuine top-level browser navigation (a `<form method="POST">` submit), not a `fetch` call: the redirect to Keycloak's `end_session_endpoint` only clears the browser's Keycloak SSO cookie if the _browser itself_ navigates there, since `fetch`'s default `same-origin` credentials mode would not send Keycloak's cookies across that cross-origin redirect hop. This means there is no in-page error state possible once the form submits (the page unloads) — the loading state only covers the brief moment before navigation, and this simplification is documented in `docs/authentication/security.md` (Task 27) rather than faked with an incorrect `fetch`-based flow.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shell/user-menu.test.tsx
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UserMenu } from './user-menu';
import type { FinaxisUser } from '@/auth/auth.types';

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  roles: [],
  branches: [],
};

describe('UserMenu', () => {
  it('displays the signed-in user name and email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /jane muthoni/i }));

    expect(screen.getByText('Jane Muthoni')).toBeInTheDocument();
    expect(screen.getByText('jane.muthoni@finaxis.test')).toBeInTheDocument();
  });

  it('opens and closes via keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    const trigger = screen.getByRole('button', { name: /jane muthoni/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: /view profile/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows initials when no image is present', () => {
    renderWithProviders(<UserMenu user={USER} />);
    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('disables the log-out action after the first click to prevent duplicate submissions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /jane muthoni/i }));
    const logOutButton = screen.getByRole('button', { name: /log out/i });
    await user.click(logOutButton);

    expect(logOutButton).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/user-menu.test.tsx`
Expected: FAIL — `Cannot find module './user-menu'`.

- [ ] **Step 3: Write `components/shell/user-menu.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import NextLink from '@/components/navigation/next-link';
import type { FinaxisUser } from '@/auth/auth.types';

interface UserMenuProps {
  user: FinaxisUser;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function UserMenu({ user }: UserMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuId = useId();
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        aria-label={user.name}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleOpen}
        color="inherit"
        sx={{ textTransform: 'none', gap: 1 }}
      >
        <Avatar src={user.image} sx={{ width: 32, height: 32, fontSize: 14 }}>
          {!user.image && initialsOf(user.name)}
        </Avatar>
        <Typography component="span" variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {user.name}
        </Typography>
      </Button>
      <Menu id={menuId} anchorEl={anchorEl} open={open} onClose={handleClose}>
        <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary">
            Signed in as
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={NextLink} href="/profile" onClick={handleClose}>
          <PersonOutlined fontSize="small" sx={{ mr: 1.5 }} />
          View profile
        </MenuItem>
        <Divider />
        <Box component="form" method="POST" action="/api/auth/logout" sx={{ px: 1, py: 0.5 }}>
          <Button
            type="submit"
            fullWidth
            color="error"
            disabled={isSigningOut}
            startIcon={isSigningOut ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() => {
              setIsSigningOut(true);
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            {isSigningOut ? 'Signing out…' : 'Log out'}
          </Button>
        </Box>
      </Menu>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/user-menu.test.tsx`
Expected: PASS, 4 tests. jsdom doesn't perform real form navigation, so the disabled-after-click assertion exercises the same `isSigningOut` state a real submission would trigger without needing a navigation mock.

- [ ] **Step 5: Commit**

```bash
git add components/shell/user-menu.tsx components/shell/user-menu.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the user menu with profile link and form-POST logout

Logout is a real <form method="POST"> submit (full navigation), not
fetch, since the browser must itself follow the redirect to
Keycloak's end_session_endpoint for its SSO cookie to clear.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Organization context provider and global header

**Files:**

- Create: `components/shell/organization-context.tsx`
- Create: `components/shell/global-header.tsx`
- Test: `components/shell/global-header.test.tsx`

**Interfaces:**

- Consumes: `ApplicationContext` (Task 8), `FinaxisUser` (Task 3), `AppSwitcher`/`ThemeModeMenu`/`NotificationButton`/`UserMenu` (Tasks 12–15).
- Produces: `ApplicationContextProvider`/`useApplicationContext`, and `GlobalHeader` — Task 17 (`AppShell`) renders `GlobalHeader` wrapped in `ApplicationContextProvider`.

- [ ] **Step 1: Write `components/shell/organization-context.tsx`**

```tsx
'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ApplicationContext } from '@/config/application-context';

const ApplicationContextReactContext = createContext<ApplicationContext | null>(null);

interface ApplicationContextProviderProps {
  value: ApplicationContext;
  children: ReactNode;
}

export function ApplicationContextProvider({ value, children }: ApplicationContextProviderProps) {
  return (
    <ApplicationContextReactContext.Provider value={value}>
      {children}
    </ApplicationContextReactContext.Provider>
  );
}

export function useApplicationContext(): ApplicationContext {
  const context = useContext(ApplicationContextReactContext);
  if (!context) {
    throw new Error('useApplicationContext must be used within an ApplicationContextProvider.');
  }
  return context;
}
```

- [ ] **Step 2: Write the failing test for `GlobalHeader`**

```tsx
// components/shell/global-header.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { GlobalHeader } from './global-header';
import { ApplicationContextProvider } from './organization-context';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  roles: [],
  branches: [],
};

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'greenfield-sacco', name: 'GreenField SACCO' },
  branch: { id: 'nairobi-central', name: 'Nairobi Central Branch' },
};

describe('GlobalHeader', () => {
  it('shows the current module, organization, branch, and user', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader user={USER} />
      </ApplicationContextProvider>,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText(/greenfield sacco/i)).toBeInTheDocument();
    expect(screen.getByText(/nairobi central branch/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /jane muthoni/i })).toBeInTheDocument();
  });

  it('renders the theme, notification, and app-switcher controls', () => {
    renderWithProviders(
      <ApplicationContextProvider value={CONTEXT}>
        <GlobalHeader user={USER} />
      </ApplicationContextProvider>,
    );

    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch application/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run components/shell/global-header.test.tsx`
Expected: FAIL — `Cannot find module './global-header'`.

- [ ] **Step 4: Write `components/shell/global-header.tsx`**

```tsx
'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import type { FinaxisUser } from '@/auth/auth.types';
import { AppSwitcher } from './app-switcher';
import { ThemeModeMenu } from './theme-mode-menu';
import { NotificationButton } from './notification-button';
import { UserMenu } from './user-menu';
import { useApplicationContext } from './organization-context';

interface GlobalHeaderProps {
  user: FinaxisUser;
}

export function GlobalHeader({ user }: GlobalHeaderProps) {
  const { module, organization, branch } = useApplicationContext();

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar sx={{ minHeight: 64, gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <FinaxisLogo size={32} />
        </Stack>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {module.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {organization.name} · {branch.name}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ThemeModeMenu />
          <NotificationButton />
          <AppSwitcher />
          <UserMenu user={user} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run components/shell/global-header.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add components/shell/organization-context.tsx components/shell/global-header.tsx components/shell/global-header.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the typed application-context provider and global header

Header shows module as primary context and organization/branch as
secondary, plus theme, notifications, app switcher, and user menu.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: App shell composition and layout wiring

**Files:**

- Create: `components/shell/app-shell.tsx`
- Test: `components/shell/app-shell.test.tsx`
- Modify: `app/(authenticated)/layout.tsx`
- Modify: `app/(authenticated)/layout.test.tsx`

**Interfaces:**

- Consumes: `GlobalHeader`/`ApplicationContextProvider` (Task 16), `applicationContext` fixture (Task 8), `FinaxisUser` (Task 3).
- Produces: `AppShell` — the only component `(authenticated)/layout.tsx` renders.

- [ ] **Step 1: Write the failing test for `AppShell`**

```tsx
// components/shell/app-shell.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppShell } from './app-shell';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  roles: [],
  branches: [],
};

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'greenfield-sacco', name: 'GreenField SACCO' },
  branch: { id: 'nairobi-central', name: 'Nairobi Central Branch' },
};

describe('AppShell', () => {
  it('renders the global header and the page content', () => {
    renderWithProviders(
      <AppShell user={USER} context={CONTEXT}>
        <div>Page content</div>
      </AppShell>,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/app-shell.test.tsx`
Expected: FAIL — `Cannot find module './app-shell'`.

- [ ] **Step 3: Write `components/shell/app-shell.tsx`**

```tsx
'use client';

import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { ApplicationContextProvider } from './organization-context';
import { GlobalHeader } from './global-header';

interface AppShellProps {
  user: FinaxisUser;
  context: ApplicationContext;
  children: ReactNode;
}

export function AppShell({ user, context, children }: AppShellProps) {
  return (
    <ApplicationContextProvider value={context}>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <GlobalHeader user={user} />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </ApplicationContextProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/app-shell.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Wire `AppShell` into the authenticated layout**

Rewrite `app/(authenticated)/layout.tsx`:

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { applicationContext } from '@/config/application-context';
import { AppShell } from '@/components/shell/app-shell';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await headers());

  if (!user) {
    redirect('/login?reason=session_expired');
  }

  return (
    <AppShell user={user} context={applicationContext}>
      {children}
    </AppShell>
  );
}
```

Update `app/(authenticated)/layout.test.tsx`'s first test (the assertion is unaffected by the shell, but the rendered tree now includes the header) — no test code changes are actually required since `screen.getByText('Protected content')` still finds the children; re-run to confirm:

- [ ] **Step 6: Run the authenticated-layout test to verify it still passes**

Run: `pnpm vitest run "app/(authenticated)/layout.test.tsx"`
Expected: PASS, 2 tests (unchanged from Task 11 — the shell renders around, not instead of, `children`).

- [ ] **Step 7: Commit**

```bash
git add components/shell/app-shell.tsx components/shell/app-shell.test.tsx "app/(authenticated)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat: compose the app shell and wire it into the authenticated layout

Every route under (authenticated) now renders inside the global
header/context chrome, not just a bare session guard.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Workspace navigation, drawer, and mobile toggle

**Files:**

- Create: `components/shell/workspace-navigation.tsx`
- Create: `components/shell/workspace-drawer.tsx`
- Create: `components/shell/mobile-navigation-button.tsx`
- Test: `components/shell/workspace-drawer.test.tsx`

**Interfaces:**

- Produces: `WorkspaceNavigationItem` type, `WorkspaceNavigation` (renders a list of items with active-route highlighting via `usePathname`), `WorkspaceDrawer` (desktop permanent/collapsible + mobile temporary variants), `MobileNavigationButton`. These are generic — Task 19 (`modules/administration`) supplies the concrete Administration nav items and composes them with `WorkspaceDrawer` inside `admin/layout.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shell/workspace-drawer.test.tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import { WorkspaceDrawer } from './workspace-drawer';
import type { WorkspaceNavigationItem } from './workspace-navigation';

// Partial mock (via importOriginal) rather than a full module replacement:
// next/link's App Router implementation reads other next/navigation
// exports internally, and replacing the whole module would break it.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: DashboardOutlined },
  { href: '/admin/users', label: 'Users', icon: GroupOutlined },
];

describe('WorkspaceDrawer', () => {
  it('marks the current route as active with aria-current', () => {
    renderWithProviders(
      <WorkspaceDrawer items={ITEMS} mobileOpen={false} onMobileClose={() => undefined} />,
    );

    const usersLinks = screen.getAllByRole('link', { name: 'Users' });
    expect(usersLinks[0]).toHaveAttribute('aria-current', 'page');
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' });
    expect(overviewLinks[0]).not.toHaveAttribute('aria-current');
  });

  it('opens and closes the mobile drawer', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <WorkspaceDrawer items={ITEMS} mobileOpen={true} onMobileClose={handleClose} />,
    );

    expect(screen.getAllByRole('link', { name: 'Users' }).length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalled();

    rerender(<WorkspaceDrawer items={ITEMS} mobileOpen={false} onMobileClose={handleClose} />);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/workspace-drawer.test.tsx`
Expected: FAIL — `Cannot find module './workspace-drawer'`.

- [ ] **Step 3: Write `components/shell/workspace-navigation.tsx`**

```tsx
'use client';

import type { ElementType } from 'react';
import { usePathname } from 'next/navigation';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import NextLink from '@/components/navigation/next-link';

export interface WorkspaceNavigationItem {
  href: string;
  label: string;
  icon: ElementType;
}

interface WorkspaceNavigationProps {
  items: readonly WorkspaceNavigationItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function WorkspaceNavigation({ items, collapsed, onNavigate }: WorkspaceNavigationProps) {
  const pathname = usePathname();

  return (
    <List component="nav" aria-label="Administration" sx={{ px: 1 }}>
      {items.map((item) => {
        const isActive = pathname === item.href;
        const button = (
          <ListItemButton
            key={item.href}
            component={NextLink}
            href={item.href}
            selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            sx={{ borderRadius: 1, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
              <item.icon fontSize="small" />
            </ListItemIcon>
            {!collapsed && <ListItemText primary={item.label} />}
          </ListItemButton>
        );

        return collapsed ? (
          <Tooltip key={item.href} title={item.label} placement="right">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </List>
  );
}
```

- [ ] **Step 4: Write `components/shell/mobile-navigation-button.tsx`**

```tsx
'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MenuOutlined from '@mui/icons-material/MenuOutlined';

interface MobileNavigationButtonProps {
  onClick: () => void;
}

export function MobileNavigationButton({ onClick }: MobileNavigationButtonProps) {
  return (
    <Tooltip title="Open navigation">
      <IconButton aria-label="Open navigation" onClick={onClick} sx={{ display: { md: 'none' } }}>
        <MenuOutlined />
      </IconButton>
    </Tooltip>
  );
}
```

- [ ] **Step 5: Write `components/shell/workspace-drawer.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import { WorkspaceNavigation, type WorkspaceNavigationItem } from './workspace-navigation';

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 72;

interface WorkspaceDrawerProps {
  items: readonly WorkspaceNavigationItem[];
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function WorkspaceDrawer({ items, mobileOpen, onMobileClose }: WorkspaceDrawerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width,
          flexShrink: 0,
          transition: (theme) =>
            theme.transitions.create('width', { duration: theme.transitions.duration.short }),
          '& .MuiDrawer-paper': {
            width,
            boxSizing: 'border-box',
            position: 'sticky',
            top: 64,
            height: 'calc(100dvh - 64px)',
            transition: (theme) =>
              theme.transitions.create('width', { duration: theme.transitions.duration.short }),
            overflowX: 'hidden',
          },
        }}
      >
        <WorkspaceNavigation items={items} collapsed={collapsed} />
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 1,
          }}
        >
          <Tooltip title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <IconButton
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              onClick={() => {
                setCollapsed((prev) => !prev);
              }}
              size="small"
            >
              {collapsed ? (
                <ChevronRightOutlined fontSize="small" />
              ) : (
                <ChevronLeftOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: EXPANDED_WIDTH },
        }}
      >
        <WorkspaceNavigation items={items} onNavigate={onMobileClose} />
      </Drawer>
    </>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run components/shell/workspace-drawer.test.tsx`
Expected: PASS, 2 tests. MUI's temporary `Drawer` wraps a `Modal`, which already closes on `Escape` and calls `onClose` by default — no extra key handling needed.

- [ ] **Step 7: Commit**

```bash
git add components/shell/workspace-navigation.tsx components/shell/workspace-drawer.tsx components/shell/mobile-navigation-button.tsx components/shell/workspace-drawer.test.tsx
git commit -m "$(cat <<'EOF'
feat: add the generic workspace navigation, drawer, and mobile toggle

Desktop permanent/collapsible drawer + mobile temporary drawer,
active-route aria-current, generic over items so future modules can
reuse it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Administration module data and layout

**Files:**

- Create: `modules/administration/administration-navigation.ts`
- Create: `modules/administration/administration-module.ts`
- Create: `app/(authenticated)/admin/layout.tsx`
- Test: `app/(authenticated)/admin/layout.test.tsx`

**Interfaces:**

- Consumes: `WorkspaceDrawer`/`WorkspaceNavigationItem`/`MobileNavigationButton` (Task 18).
- Produces: `administrationNavigationItems`, `administrationModule` — Task 20 (Overview page) and Task 21 (placeholder pages) import `administrationModule` for breadcrumb/heading text.

- [ ] **Step 1: Write `modules/administration/administration-navigation.ts`**

```ts
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: DashboardOutlined },
  { href: '/admin/users', label: 'Users', icon: GroupOutlined },
  { href: '/admin/branches', label: 'Branches', icon: AccountTreeOutlined },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: SecurityOutlined },
  { href: '/admin/settings', label: 'Settings', icon: SettingsOutlined },
  { href: '/admin/audit', label: 'Audit Logs', icon: FactCheckOutlined },
] as const;
```

- [ ] **Step 2: Write `modules/administration/administration-module.ts`**

```ts
export const administrationModule = {
  id: 'administration',
  name: 'Administration',
  description: 'Manage users, branches, roles, settings, and audit logs for your organization.',
} as const;
```

- [ ] **Step 3: Write the failing test for the Administration layout**

```tsx
// app/(authenticated)/admin/layout.test.tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// Partial mock (via importOriginal): see the identical note in
// components/shell/workspace-drawer.test.tsx — next/link needs the rest of
// next/navigation's real exports to keep working.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const { default: AdministrationLayout } = await import('./layout');

describe('AdministrationLayout', () => {
  it('renders the Administration navigation and the page content', () => {
    renderWithProviders(<AdministrationLayout>{<div>Users page</div>}</AdministrationLayout>);

    expect(screen.getAllByRole('link', { name: 'Users' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Users page')).toBeInTheDocument();
  });

  it('opens the mobile drawer from the mobile menu button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdministrationLayout>{<div>Users page</div>}</AdministrationLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation/i }));

    expect(screen.getAllByRole('link', { name: 'Branches' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run "app/(authenticated)/admin/layout.test.tsx"`
Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 5: Write `app/(authenticated)/admin/layout.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { WorkspaceDrawer } from '@/components/shell/workspace-drawer';
import { MobileNavigationButton } from '@/components/shell/mobile-navigation-button';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';

export default function AdministrationLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100dvh - 64px)' }}>
      <WorkspaceDrawer
        items={administrationNavigationItems}
        mobileOpen={mobileOpen}
        onMobileClose={() => {
          setMobileOpen(false);
        }}
      />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar
          variant="dense"
          sx={{
            display: { xs: 'flex', md: 'none' },
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <MobileNavigationButton
            onClick={() => {
              setMobileOpen(true);
            }}
          />
          <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 600 }}>
            Administration
          </Typography>
        </Toolbar>
        <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run "app/(authenticated)/admin/layout.test.tsx"`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add modules/administration/administration-navigation.ts modules/administration/administration-module.ts "app/(authenticated)/admin/layout.tsx" "app/(authenticated)/admin/layout.test.tsx"
git commit -m "$(cat <<'EOF'
feat: add the Administration module data and drawer layout

Wires the generic WorkspaceDrawer with Administration's six nav
items (Overview/Users/Branches/Roles & Permissions/Settings/Audit
Logs) and a mobile toggle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Section heading and the Administration Overview page

**Files:**

- Create: `components/shell/section-heading.tsx`
- Test: `components/shell/section-heading.test.tsx`
- Create: `app/(authenticated)/admin/page.tsx`
- Test: `app/(authenticated)/admin/page.test.tsx`

**Interfaces:**

- Consumes: `administrationModule` (Task 19).
- Produces: `SectionHeading` — Task 21's five placeholder pages also render this.

- [ ] **Step 1: Write the failing test for `SectionHeading`**

```tsx
// components/shell/section-heading.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { SectionHeading } from './section-heading';

describe('SectionHeading', () => {
  it('renders a breadcrumb, one h1, and the description', () => {
    renderWithProviders(
      <SectionHeading
        parentLabel="Administration"
        parentHref="/admin"
        label="Users"
        description="Invite and manage accounts."
      />,
    );

    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Invite and manage accounts.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/section-heading.test.tsx`
Expected: FAIL — `Cannot find module './section-heading'`.

- [ ] **Step 3: Write `components/shell/section-heading.tsx`**

```tsx
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import MuiLink from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

interface SectionHeadingProps {
  parentLabel: string;
  parentHref: string;
  label: string;
  description: string;
}

export function SectionHeading({
  parentLabel,
  parentHref,
  label,
  description,
}: SectionHeadingProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
        <MuiLink component={NextLink} href={parentHref} underline="hover" color="text.secondary">
          {parentLabel}
        </MuiLink>
        <Typography color="text.primary">{label}</Typography>
      </Breadcrumbs>
      <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        {description}
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/section-heading.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Write the failing test for the Overview page**

```tsx
// app/(authenticated)/admin/page.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import AdminOverviewPage from './page';

describe('AdminOverviewPage', () => {
  it('renders one h1 and quick links to each management area', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /manage users/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: /manage branches/i })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(screen.getByRole('link', { name: /review roles/i })).toHaveAttribute(
      'href',
      '/admin/roles',
    );
    expect(screen.getByRole('link', { name: /open audit logs/i })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });

  it('labels summary figures as sample data rather than implying they are live', () => {
    renderWithProviders(<AdminOverviewPage />);
    expect(screen.getByText(/sample data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run "app/(authenticated)/admin/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 7: Write `app/(authenticated)/admin/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import NextLink from '@/components/navigation/next-link';
import { SectionHeading } from '@/components/shell/section-heading';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Overview' };

interface OverviewCardData {
  icon: typeof GroupOutlined;
  title: string;
  value: string;
  actionLabel: string;
  href: string;
}

const OVERVIEW_CARDS: readonly OverviewCardData[] = [
  {
    icon: GroupOutlined,
    title: 'Users',
    value: '128 active',
    actionLabel: 'Manage users',
    href: '/admin/users',
  },
  {
    icon: AccountTreeOutlined,
    title: 'Branches',
    value: '6 branches',
    actionLabel: 'Manage branches',
    href: '/admin/branches',
  },
  {
    icon: SecurityOutlined,
    title: 'Roles',
    value: '5 roles defined',
    actionLabel: 'Review roles',
    href: '/admin/roles',
  },
  {
    icon: MailOutlined,
    title: 'Pending invitations',
    value: '3 pending',
    actionLabel: 'Manage users',
    href: '/admin/users',
  },
  {
    icon: ShieldOutlined,
    title: 'Recent security events',
    value: 'No events in the last 7 days',
    actionLabel: 'Open audit logs',
    href: '/admin/audit',
  },
  {
    icon: TuneOutlined,
    title: 'Configuration status',
    value: 'Core settings configured',
    actionLabel: 'Open settings',
    href: '/admin/settings',
  },
];

export default function AdminOverviewPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Overview"
        description={administrationModule.description}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Showing sample data until live services are connected.
      </Typography>
      <Grid container spacing={3}>
        {OVERVIEW_CARDS.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <card.icon color="action" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {card.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {card.value}
                </Typography>
              </CardContent>
              <CardActions>
                <Button component={NextLink} href={card.href} size="small">
                  {card.actionLabel}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
```

Verify the installed MUI v9 `Grid` API accepts the `size={{ xs, sm, lg }}` prop shape (the post-`Grid2` unified API) — check `node_modules/@mui/material/Grid/Grid.d.ts` if `pnpm typecheck` reports otherwise, rather than assuming an older `item xs={12}` shape.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run "app/(authenticated)/admin/page.test.tsx"`
Expected: PASS, 2 tests.

- [ ] **Step 9: Commit**

```bash
git add components/shell/section-heading.tsx components/shell/section-heading.test.tsx "app/(authenticated)/admin/page.tsx" "app/(authenticated)/admin/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: add the Administration Overview page

Six summary cards with quick links, explicitly labeled as sample
data so they don't imply a connected backend that doesn't exist yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Administration placeholder pages

**Files:**

- Create: `components/shell/placeholder-section.tsx`
- Test: `components/shell/placeholder-section.test.tsx`
- Create: `app/(authenticated)/admin/users/page.tsx`
- Create: `app/(authenticated)/admin/branches/page.tsx`
- Create: `app/(authenticated)/admin/roles/page.tsx`
- Create: `app/(authenticated)/admin/settings/page.tsx`
- Create: `app/(authenticated)/admin/audit/page.tsx`

**Interfaces:**

- Consumes: `SectionHeading` (Task 20), `administrationModule` (Task 19).
- Produces: five polished placeholder routes completing the Administration drawer's nav items from Task 19.

- [ ] **Step 1: Write the failing test for `PlaceholderSection`**

```tsx
// components/shell/placeholder-section.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PlaceholderSection } from './placeholder-section';

describe('PlaceholderSection', () => {
  it('renders the label and the empty-state message', () => {
    renderWithProviders(
      <PlaceholderSection
        label="User management"
        emptyStateMessage="User management will let you invite staff and assign roles."
      />,
    );

    expect(screen.getByText(/user management isn't available yet/i)).toBeInTheDocument();
    expect(
      screen.getByText('User management will let you invite staff and assign roles.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/placeholder-section.test.tsx`
Expected: FAIL — `Cannot find module './placeholder-section'`.

- [ ] **Step 3: Write `components/shell/placeholder-section.tsx`**

```tsx
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

interface PlaceholderSectionProps {
  label: string;
  emptyStateMessage: string;
}

export function PlaceholderSection({ label, emptyStateMessage }: PlaceholderSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <InfoOutlined color="disabled" fontSize="large" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {label} isn&apos;t available yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptyStateMessage}
        </Typography>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/placeholder-section.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Write the five placeholder pages**

`app/(authenticated)/admin/users/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Users' };

export default function AdminUsersPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Users"
        description="Invite, deactivate, and manage member-facing and staff accounts."
      />
      <PlaceholderSection
        label="User management"
        emptyStateMessage="User management will let you invite staff, assign roles, and review account status once it's connected to the identity and provisioning services."
      />
    </>
  );
}
```

`app/(authenticated)/admin/branches/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Branches' };

export default function AdminBranchesPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Branches"
        description="Manage branch locations and their operating configuration."
      />
      <PlaceholderSection
        label="Branch management"
        emptyStateMessage="Branch management will let you create, edit, and assign staff to branches once branch resolution is connected."
      />
    </>
  );
}
```

`app/(authenticated)/admin/roles/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Roles & Permissions' };

export default function AdminRolesPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Roles & Permissions"
        description="Define application roles and the permissions attached to them."
      />
      <PlaceholderSection
        label="Roles & permissions"
        emptyStateMessage="Role and permission management will appear here once an authorization policy engine is connected. Roles shown elsewhere in the app today are informational only."
      />
    </>
  );
}
```

`app/(authenticated)/admin/settings/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Settings' };

export default function AdminSettingsPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Settings"
        description="Organization-wide configuration for the Finaxis workspace."
      />
      <PlaceholderSection
        label="Organization settings"
        emptyStateMessage="Organization-wide settings will appear here once configuration management is connected."
      />
    </>
  );
}
```

`app/(authenticated)/admin/audit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Audit Logs' };

export default function AdminAuditPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Audit Logs"
        description="Review security-relevant events across your organization."
      />
      <PlaceholderSection
        label="Audit logs"
        emptyStateMessage="Audit log review will appear here once event delivery is connected."
      />
    </>
  );
}
```

- [ ] **Step 6: Verify each page renders exactly one h1 and no lorem ipsum**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. Then run:

```bash
grep -rniE "lorem ipsum" "app/(authenticated)/admin" || echo "no lorem ipsum found"
```

Expected: `no lorem ipsum found`.

- [ ] **Step 7: Commit**

```bash
git add components/shell/placeholder-section.tsx components/shell/placeholder-section.test.tsx "app/(authenticated)/admin/users" "app/(authenticated)/admin/branches" "app/(authenticated)/admin/roles" "app/(authenticated)/admin/settings" "app/(authenticated)/admin/audit"
git commit -m "$(cat <<'EOF'
feat: add the five Administration placeholder pages

Users, Branches, Roles & Permissions, Settings, and Audit Logs each
get a real breadcrumb/heading/description and an honest empty state
— no fake tables, no lorem ipsum.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Profile page

**Files:**

- Create: `components/shell/initials.ts`
- Test: `components/shell/initials.test.ts`
- Modify: `components/shell/user-menu.tsx` (use the shared `initialsOf` instead of a local copy)
- Create: `components/profile/profile-view.tsx`
- Test: `components/profile/profile-view.test.tsx`
- Create: `app/(authenticated)/profile/page.tsx`

**Interfaces:**

- Consumes: `FinaxisUser` (Task 3), `SectionHeading` (Task 20), `getAuthenticatedUser`/`auth` (Tasks 7, 4).
- Produces: the `/profile` route.

- [ ] **Step 1: Write the failing test for the shared `initialsOf` helper**

```ts
// components/shell/initials.test.ts
import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('returns the first and last initials for a two-word name', () => {
    expect(initialsOf('Jane Muthoni')).toBe('JM');
  });

  it('returns a single initial for a one-word name', () => {
    expect(initialsOf('Cher')).toBe('C');
  });

  it('returns "?" for a blank name', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/shell/initials.test.ts`
Expected: FAIL — `Cannot find module './initials'`.

- [ ] **Step 3: Write `components/shell/initials.ts`**

```ts
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/shell/initials.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Deduplicate `user-menu.tsx`**

In `components/shell/user-menu.tsx`, delete the local `initialsOf` function and add `import { initialsOf } from './initials';` alongside the other imports. Re-run `pnpm vitest run components/shell/user-menu.test.tsx` to confirm the existing 4 tests still pass unchanged.

- [ ] **Step 6: Write the failing test for `ProfileView`**

```tsx
// components/profile/profile-view.test.tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ProfileView } from './profile-view';
import type { FinaxisUser } from '@/auth/auth.types';

const SIGNED_IN_AT = new Date('2026-07-17T09:00:00Z');

describe('ProfileView', () => {
  it('shows empty states for branches and roles when none are assigned', () => {
    const user: FinaxisUser = {
      id: 'user-1',
      name: 'Jane Muthoni',
      email: 'jane.muthoni@finaxis.test',
      roles: [],
      branches: [],
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getByText('No branches assigned')).toBeInTheDocument();
    expect(screen.getByText('No application roles assigned')).toBeInTheDocument();
    expect(screen.getByText('No organization assigned')).toBeInTheDocument();
  });

  it('renders assigned branches, roles, and organization as chips', () => {
    const user: FinaxisUser = {
      id: 'user-2',
      name: 'Kevin Otieno',
      email: 'kevin.otieno@finaxis.test',
      roles: ['branch-teller'],
      branches: [{ id: 'nairobi-central', name: 'Nairobi Central Branch' }],
      organization: { id: 'greenfield-sacco', name: 'GreenField SACCO' },
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getByText('Nairobi Central Branch')).toBeInTheDocument();
    expect(screen.getByText('branch-teller')).toBeInTheDocument();
    expect(screen.getByText('GreenField SACCO')).toBeInTheDocument();
  });

  it('shows the user ID only inside the technical-details section, not the main view', () => {
    const user: FinaxisUser = {
      id: 'user-3',
      name: 'Amina Yusuf',
      email: 'amina.yusuf@finaxis.test',
      roles: [],
      branches: [],
    };

    renderWithProviders(<ProfileView user={user} signedInAt={SIGNED_IN_AT} />);

    expect(screen.getByText(/user id: user-3/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm vitest run components/profile/profile-view.test.tsx`
Expected: FAIL — `Cannot find module './profile-view'`.

- [ ] **Step 8: Write `components/profile/profile-view.tsx`**

```tsx
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { SectionHeading } from '@/components/shell/section-heading';
import { initialsOf } from '@/components/shell/initials';
import type { FinaxisUser } from '@/auth/auth.types';

interface ProfileViewProps {
  user: FinaxisUser;
  signedInAt: Date;
}

export function ProfileView({ user, signedInAt }: ProfileViewProps) {
  return (
    <>
      <SectionHeading
        parentLabel="Finaxis"
        parentHref="/admin"
        label="Profile"
        description="Your signed-in identity and workspace assignments."
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Avatar
              src={user.image}
              sx={{ width: 80, height: 80, mx: 'auto', mb: 2, fontSize: 28 }}
            >
              {!user.image && initialsOf(user.name)}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {user.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user.email}
            </Typography>
            {user.username && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                @{user.username}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 2 }}>
              <Chip
                icon={<CheckCircleOutlined />}
                label="Signed in"
                color="success"
                size="small"
                variant="outlined"
              />
              <Chip label="Keycloak" size="small" variant="outlined" />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Last authenticated {signedInAt.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Organization
              </Typography>
              {user.organization ? (
                <Typography variant="body2">{user.organization.name}</Typography>
              ) : (
                <Alert severity="info" variant="outlined">
                  No organization assigned
                </Alert>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Branches
              </Typography>
              {user.branches.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {user.branches.map((branch) => (
                    <Chip key={branch.id} label={branch.name} />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info" variant="outlined">
                  No branches assigned
                </Alert>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Roles
              </Typography>
              {user.roles.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {user.roles.map((role) => (
                    <Chip key={role} label={role} />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info" variant="outlined">
                  No application roles assigned
                </Alert>
              )}
            </Paper>

            <Accordion variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Typography variant="subtitle2">Technical details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    User ID: {user.id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Identity provider: Keycloak
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
```

MUI's `Accordion` starts collapsed, so the `AccordionDetails` content isn't in the accessibility tree until expanded in a browser — but Testing Library's default jsdom render keeps it in the DOM (just visually hidden via CSS transitions), so `screen.getByText(/user id/i)` in Step 6's test finds it without needing to click the summary first. If that assumption turns out wrong when the test actually runs, expand it first with `userEvent.click(screen.getByText('Technical details'))` before asserting.

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm vitest run components/profile/profile-view.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 10: Write `app/(authenticated)/profile/page.tsx`**

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth/auth';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { ProfileView } from '@/components/profile/profile-view';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const headersList = await headers();
  const [user, session] = await Promise.all([
    getAuthenticatedUser(headersList),
    auth.api.getSession({ headers: headersList }),
  ]);

  // (authenticated)/layout.tsx already redirects when there is no session;
  // this defensive re-check follows Next's guidance to verify auth in every
  // Server Component that renders sensitive data, not just in the layout.
  if (!user || !session) {
    redirect('/login?reason=session_expired');
  }

  return <ProfileView user={user} signedInAt={session.session.createdAt} />;
}
```

- [ ] **Step 11: Manually verify the route renders**

Run:

```bash
PORT=3100 pnpm build && PORT=3100 pnpm start &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/profile
kill %1
```

Expected: `307`/`308` redirect to `/login` (no session cookie present in this `curl` request — confirms the guard fires; full render is exercised by the seeded-session E2E test in Task 26).

- [ ] **Step 12: Commit**

```bash
git add components/shell/initials.ts components/shell/initials.test.ts components/shell/user-menu.tsx components/profile/profile-view.tsx components/profile/profile-view.test.tsx "app/(authenticated)/profile/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add the read-only profile page

Sanitized FinaxisUser display only — no tokens, cookies, or raw
claims; empty branches/roles/organization render honest "not
assigned" states rather than fabricated data.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: Logout route with validated Keycloak RP-initiated logout

**Files:**

- Create: `auth/build-keycloak-logout-url.ts`
- Test: `auth/build-keycloak-logout-url.test.ts`
- Create: `app/api/auth/logout/route.ts`

**Interfaces:**

- Consumes: `auth` (Task 4), `serverEnv` (Task 2).
- Produces: `buildKeycloakLogoutUrl(input): string` and the `POST /api/auth/logout` route — Task 15's `user-menu.tsx` form already targets this URL.

Better Auth 1.6.23 does not expose the stored Keycloak ID token through a documented, safe, server-only API (confirmed during design research — `auth.api.getAccessToken` returns only `accessToken`/`refreshToken`/expiries, no `idToken`). Rather than fetch it through an undocumented internal path, this logout omits `id_token_hint` and relies on `client_id` + an allowlisted, registered `post_logout_redirect_uri`, which Keycloak's RP-Initiated Logout accepts for a confidential client whose redirect URI is registered (verified against the real local Keycloak in Task 1 Step 4). This limitation is documented in `docs/authentication/security.md` (Task 27), not hidden.

- [ ] **Step 1: Write the failing test for `buildKeycloakLogoutUrl`**

```ts
// auth/build-keycloak-logout-url.test.ts
import { describe, expect, it } from 'vitest';
import { buildKeycloakLogoutUrl } from './build-keycloak-logout-url';

const BASE_INPUT = {
  issuer: 'http://localhost:8080/realms/finaxis',
  clientId: 'finaxis-web',
  trustedOrigins: ['http://localhost:3100', 'http://localhost:3000'],
};

describe('buildKeycloakLogoutUrl', () => {
  it('builds the Keycloak end-session URL with client_id and post_logout_redirect_uri', () => {
    const url = buildKeycloakLogoutUrl({
      ...BASE_INPUT,
      postLogoutRedirectUri: 'http://localhost:3100/login',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'http://localhost:8080/realms/finaxis/protocol/openid-connect/logout',
    );
    expect(parsed.searchParams.get('client_id')).toBe('finaxis-web');
    expect(parsed.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3100/login');
  });

  it('rejects a post-logout redirect whose origin is not in the trusted list', () => {
    expect(() =>
      buildKeycloakLogoutUrl({
        ...BASE_INPUT,
        postLogoutRedirectUri: 'http://evil.example/login',
      }),
    ).toThrow(/untrusted origin/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run auth/build-keycloak-logout-url.test.ts`
Expected: FAIL — `Cannot find module './build-keycloak-logout-url'`.

- [ ] **Step 3: Write `auth/build-keycloak-logout-url.ts`**

```ts
export interface BuildKeycloakLogoutUrlInput {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  trustedOrigins: readonly string[];
}

/**
 * Never accept an arbitrary logout redirect — the caller's
 * postLogoutRedirectUri must belong to a trusted origin, even though
 * config/env.server.ts already validates AUTH_POST_LOGOUT_REDIRECT_URI at
 * startup. This is defense in depth for any future caller of this function.
 */
export function buildKeycloakLogoutUrl({
  issuer,
  clientId,
  postLogoutRedirectUri,
  trustedOrigins,
}: BuildKeycloakLogoutUrlInput): string {
  const redirectOrigin = new URL(postLogoutRedirectUri).origin;
  const isTrusted = trustedOrigins.some((origin) => new URL(origin).origin === redirectOrigin);

  if (!isTrusted) {
    throw new Error(
      `Refusing to build a Keycloak logout URL for untrusted origin "${redirectOrigin}".`,
    );
  }

  const url = new URL(`${issuer}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  return url.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run auth/build-keycloak-logout-url.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth/auth';
import { serverEnv } from '@/config/env.server';
import { buildKeycloakLogoutUrl } from '@/auth/build-keycloak-logout-url';

export async function POST(request: NextRequest) {
  await auth.api.signOut({ headers: request.headers });

  const logoutUrl = buildKeycloakLogoutUrl({
    issuer: serverEnv.KEYCLOAK_ISSUER,
    clientId: serverEnv.KEYCLOAK_CLIENT_ID,
    postLogoutRedirectUri: serverEnv.AUTH_POST_LOGOUT_REDIRECT_URI,
    trustedOrigins: serverEnv.AUTH_TRUSTED_ORIGINS,
  });

  return NextResponse.redirect(logoutUrl, { status: 303 });
}
```

No `GET` export — a plain link or crawler prefetch cannot trigger logout, only the `user-menu.tsx` form's real `POST` submit can.

Verify that `auth.api.signOut` actually clears the `finaxis.session_token` cookie when called from a Route Handler (not just a Server Action) now that `nextCookies()` is registered (Task 4): after Task 1's Keycloak client exists and Task 2's `.env.local` is in place, run a real end-to-end check once the app is running (`PORT=3100 pnpm dev`) by inspecting the `Set-Cookie` response header from `curl -i -X POST http://localhost:3100/api/auth/logout` with a captured session cookie — this is exercised for real in Task 28's Keycloak smoke test. If the cookie isn't cleared, check whether `auth.api.signOut` needs `{ headers, asResponse: true }` and forward its `Set-Cookie` header onto the `NextResponse.redirect` manually instead of relying on `nextCookies()`.

- [ ] **Step 6: Commit**

```bash
git add auth/build-keycloak-logout-url.ts auth/build-keycloak-logout-url.test.ts "app/api/auth/logout/route.ts"
git commit -m "$(cat <<'EOF'
feat: add the POST-first logout route with validated Keycloak RP logout

Clears the local Better Auth session, then redirects the browser
(not fetch) to Keycloak's end_session_endpoint with client_id and an
allowlisted post_logout_redirect_uri — id_token_hint is intentionally
omitted since Better Auth 1.6.23 exposes no safe server-only accessor
for the stored ID token; documented as a known limitation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Security response headers

**Files:**

- Modify: `next.config.ts`

**Interfaces:**

- Produces: response headers applied to every route — no other task depends on this programmatically, but Task 28's E2E suite verifies it.

- [ ] **Step 1: Rewrite `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Emotion (MUI's styling engine, via AppRouterCacheProvider) injects <style>
// tags without a CSP nonce in this setup, so style-src keeps 'unsafe-inline'
// — narrowly scoped to styles only, never script-src. See
// docs/authentication/security.md for the full CSP rationale.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify headers are present and dev mode still works**

Run:

```bash
PORT=3100 pnpm dev &
sleep 3
curl -sI http://localhost:3100/login | grep -iE 'content-security-policy|x-content-type-options|referrer-policy|permissions-policy'
kill %1
```

Expected: all four headers print (no `Strict-Transport-Security` in development, by design). Then open `http://localhost:3100/login` in a real browser and confirm no CSP violation errors appear in the console for MUI/Emotion styles, fonts, or the Inter Google Font — if `font-src`/`style-src` need loosening for `next/font`'s self-hosted font strategy (it inlines font files at build time under the app's own origin, so `'self'` should already cover it), adjust based on what the console actually reports rather than guessing further.

- [ ] **Step 3: Run `pnpm check`**

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "$(cat <<'EOF'
feat: add security response headers and a CSP scoped to this app

nosniff, strict-origin-when-cross-origin referrer policy, a locked
frame-ancestors/form-action/connect-src CSP, and production-only
HSTS. style-src keeps 'unsafe-inline' narrowly for Emotion's
un-nonced injected styles — script-src stays 'self' only.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Authentication documentation

**Files:**

- Create: `docs/authentication/architecture.md`
- Create: `docs/authentication/keycloak.md`
- Create: `docs/authentication/stateless-sessions.md`
- Create: `docs/authentication/security.md`

**Interfaces:** None — prose only, no other task imports these.

- [ ] **Step 1: Write `docs/authentication/architecture.md`**

````markdown
# Authentication architecture

Finaxis uses Better Auth as its OIDC client, with Keycloak as the identity
provider, entirely through same-origin `/api/auth/*` routes. The browser
never talks to Keycloak's token endpoint directly.

## Login sequence

​```mermaid
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
    Finaxis-->>Browser: Authenticated app shell

​```

## Logout sequence

​```mermaid
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

​```

## Components

- `auth/auth.ts` — the Better Auth server instance (Generic OAuth + `keycloak()`, stateless
  `jwe` cookie-cache sessions, `nextCookies()`).
- `app/api/auth/[...all]/route.ts` — Better Auth's own Next.js handler, mounted same-origin.
- `app/api/auth/logout/route.ts` — the custom, POST-only, validated Keycloak RP-initiated logout.
- `auth/auth-client.ts` — the browser-safe client used to start sign-in and (via the user menu's
  form) sign-out.
- `auth/get-authenticated-user.ts` / `auth/map-authenticated-user.ts` — the single server-side
  boundary between Better Auth's session shape and the application's `FinaxisUser` DTO.
- `app/(authenticated)/layout.tsx` — the authoritative, server-validated route guard.
- `proxy.ts` — optimistic, cookie-presence-only redirects; never the authorization boundary.

## Callback URL

​`
http://localhost:3100/api/auth/oauth2/callback/keycloak   (this environment)
http://localhost:3000/api/auth/oauth2/callback/keycloak   (canonical/documented example)
​`

See `docs/authentication/keycloak.md` for the full client configuration and
`docs/authentication/stateless-sessions.md` for the session model.
````

- [ ] **Step 2: Write `docs/authentication/keycloak.md`**

````markdown
# Keycloak client configuration

## Realm

- Realm: `finaxis`
- This client: `finaxis-web` (confidential, browser-facing) — distinct from `finaxis-platform`
  (public, direct-access-grants, used only by the Spring Boot backend and its smoke test).

## Client settings

​`
Client authentication:        Enabled (confidential)
Standard flow:                Enabled
Implicit flow:                Disabled
Direct access grants:         Disabled
Service accounts:             Disabled
PKCE:                         S256
​`

## Local development

​```
Root URL:
http://localhost:3100 (this environment; 3000 is canonical
— see the port note below)

Valid redirect URI:
http://localhost:3100/api/auth/oauth2/callback/keycloak

Valid post-logout redirect URI:
http://localhost:3100/login

Web origin:
http://localhost:3100
​```

> **Port note:** this environment runs the frontend on `3100` because the platform's
> `grafana-lgtm` container already holds `3000`. The Keycloak client registers both
> `3000` and `3100` variants of every URI above so the same client definition works
> in either environment. Set `BETTER_AUTH_URL` (and the matching Keycloak URIs) to
> whichever port your environment actually uses.

## Production

Use exact HTTPS origins — never `*`, `https://*`, or `http://*`:

​`
https://app.finaxis.example/api/auth/oauth2/callback/keycloak
https://app.finaxis.example/login
https://app.finaxis.example
​`

## Scopes

Required: `openid`, `profile`, `email`.

## Optional claim mappers

The application tolerates all of these being absent — it does not fabricate values for
them. Currently none of these mappers exist on the realm; `roles`/`branches`/`organization`
render as explicit "not assigned" states in the UI until they're added:

​`
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
​`

## Admin API client creation (this environment)

The `finaxis-web` client was created against the already-running local Keycloak via the
Admin REST API (see the implementation plan's Task 1) and the same definition was appended
to `platform/docker/keycloak/import/finaxis-realm.json` so a clean `--import-realm` recreates
it identically. The client secret lives only in `finaxis-frontend/.env.local` (gitignored)
and, for local-dev convenience only, in that realm export file — never in a production
realm export.
````

- [ ] **Step 3: Write `docs/authentication/stateless-sessions.md`**

```markdown
# Stateless sessions

Better Auth runs with no `database` option configured — there is no application
authentication database. Session state lives entirely in an encrypted, `HttpOnly` cookie.

## Policy

​`
Session lifetime:          8 hours
Cookie strategy:           jwe (encrypted)
Cookie refresh:            enabled (refreshCache: true) — refreshes before expiry
Session version:           1
Cookie prefix:             finaxis
​`

8 hours (not the library's 7-day default) was chosen deliberately for an enterprise finance
system — see `AGENTS.md` for the rule against defaulting to long-lived sessions.

## Trade-offs — read before assuming otherwise

- **No per-session database lookup.** Session validity is checked by decrypting and verifying
  the cookie's signature/expiry, not by looking up a session row.
- **Logout cannot centrally revoke every already-issued cookie.** Local sign-out clears the
  browser's cookie and Keycloak's SSO session (see `app/api/auth/logout/route.ts`), but there is
  no way to invalidate a _specific_ already-issued encrypted session cookie short of it expiring
  or a global version bump (below). If a session cookie were somehow exfiltrated, it remains
  valid until its `expiresIn` elapses.
- **Changing `session.cookieCache.version` invalidates every existing session at once.** This is
  the only "kill switch" available in this configuration — use it for a security incident, not
  routine deploys.
- **Account-cookie size is a real risk, not a theoretical one.** `account.storeAccountCookie:
true` keeps the Keycloak account/token data in an encrypted cookie too. Large ID tokens (many
  realm/client roles, many group memberships) can push total cookie size toward browser
  (~4KB per cookie, and combined-header limits) and reverse-proxy header-size limits. Test with
  this realm's actual token sizes before adding many role/group claim mappers — see
  `docs/authentication/keycloak.md`'s optional-claims list — and watch for `431 Request Header
Fields Too Large` in server logs if it's exceeded.
- **No fine-grained session administration UI.** There is no "list my active sessions" or
  "revoke this specific device" feature in this configuration.

## When to move off pure-stateless

If any of the following become requirements, add Redis (or a database) as
`secondaryStorage`/`database` rather than trying to stretch the stateless model further:

- Centrally revoking one specific user's session before it expires.
- Durable, cross-restart session administration ("view all active sessions").
- Token payloads that push cookie size past practical limits.

This is a known, intentional trade-off for this iteration — not an oversight.
```

- [ ] **Step 4: Write `docs/authentication/security.md`**

```markdown
# Security

## CORS

The deployment is same-origin only:

​`
Frontend:  http://localhost:3100 (this environment) / https://app.finaxis.example (production)
Auth API:  <same origin>/api/auth/*
​`

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

​`
HttpOnly:      always
Secure:        production only (advanced.useSecureCookies)
SameSite:      Lax (Better Auth default — no flow in this app requires None)
Path:          /
Prefix:        finaxis
Domain:        host-only (no crossSubDomainCookies configured)
​`

## Reverse proxy / production origin

- `BETTER_AUTH_URL` is always set explicitly in production — never derived from
  client-supplied `X-Forwarded-Host`.
- The ingress/load balancer in front of production must overwrite (not merely append to)
  `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` so they can't be spoofed by a
  client — this app trusts those headers implicitly wherever Next.js or Better Auth read them.
- HTTPS is required in production (`config/env.server.ts` enforces this at startup); enable
  HSTS at the ingress or confirm `next.config.ts`'s production-only `Strict-Transport-Security`
  header reaches the client unmodified.
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
The default in-memory rate-limit store is **not sufficient once more than one application
instance runs** (multiple instances don't share counters) — a multi-instance or serverless
production deployment must configure `rateLimit.storage: 'secondary-storage'` backed by
Redis before going live with more than one instance. This is not implemented yet; it's
called out here so it isn't missed at deploy time.

## Troubleshooting

| Symptom                                           | Likely cause                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Invalid Origin" from Better Auth                 | The request's origin isn't in `AUTH_TRUSTED_ORIGINS`                                                                                                                   |
| Redirect loop between `/login` and `/admin`       | `proxy.ts`'s cookie check and the layout guard disagree — confirm the cookie name/prefix passed to `getSessionCookie` matches `auth/auth.ts`'s `advanced.cookiePrefix` |
| Cookies not being set after the Keycloak callback | `BETTER_AUTH_URL` doesn't match the origin the browser is actually using (e.g. testing on `3100` with `BETTER_AUTH_URL` still set to `3000`)                           |
| `431 Request Header Fields Too Large`             | Account/session cookie has grown too large — see `docs/authentication/stateless-sessions.md`'s token-size risk                                                         |
| Logout doesn't end the Keycloak SSO session       | Confirm the browser did a real top-level navigation to the logout URL (not a `fetch`) — see `components/shell/user-menu.tsx`                                           |
```

- [ ] **Step 5: Commit**

```bash
git add docs/authentication
git commit -m "$(cat <<'EOF'
docs: add authentication architecture, Keycloak, session, and security docs

Documents the login/logout sequence, required Keycloak client
settings, stateless-session trade-offs (including the no-id_token_hint
logout limitation), and CORS/CSRF/cookie/proxy/rate-limit policy.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Update `README.md` and `AGENTS.md`

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Replace README's "Mock authentication" section**

Read the current `README.md` first (it has changed shape slightly since this plan was written — re-read before editing). Replace the existing `## Mock authentication` section (the one describing `mock-authenticate.ts` and `locked@finaxis.test`) with:

```markdown
## Authentication

Real Keycloak OIDC authentication via [Better Auth](https://better-auth.com), running
stateless (no application auth database) — see `docs/authentication/architecture.md` for the
full sequence and `docs/authentication/stateless-sessions.md` for the session model and its
trade-offs.

- The login page's single action starts a Better Auth Generic OAuth (`keycloak()` provider)
  Authorization Code + PKCE flow through same-origin `/api/auth/*` routes — the browser never
  calls Keycloak directly.
- `app/(authenticated)/layout.tsx` is the authoritative, server-validated guard for `/admin` and
  `/profile`; `proxy.ts` only does an optimistic, cookie-presence redirect.
- Logout (`components/shell/user-menu.tsx`) is a real `<form method="POST">` submit to
  `/api/auth/logout`, which clears the local session and redirects the browser to Keycloak's
  RP-initiated logout endpoint — see `docs/authentication/security.md` for why it can't include
  `id_token_hint` in this Better Auth version.
- `docs/authentication/keycloak.md` documents the required Keycloak client settings.
```

- [ ] **Step 2: Update the directory structure listing**

In the same file's directory-structure code block, add the new top-level entries introduced by
this plan (`auth/`, `config/`, `modules/`, and the expanded `app/`/`components/` trees) alongside
the existing `theme/`/`test/` entries — reflect Task 1–25's actual file layout (see this plan's
own file lists) rather than re-describing the old mock-auth-era structure.

- [ ] **Step 3: Update "Current limitations"**

Remove the "No authentication, session, or identity-provider integration" bullet (no longer
true) and replace it with:

```markdown
- No organization/branch selection API yet — `config/application-context.ts` is a hardcoded
  fixture standing in for it.
- No authorization/permission enforcement — roles shown in the UI (currently always empty,
  since no Keycloak claim mappers exist yet) are informational only, not a trust boundary.
- Administration's Users/Branches/Roles & Permissions/Settings/Audit Logs pages are polished
  placeholders, not connected to real data.
```

Leave the "No API client or data layer" and legal/support-link bullets as they are if still accurate after Step 1's re-read.

- [ ] **Step 4: Append new rules to `AGENTS.md`**

Add a new section (after the existing "Finaxis frontend rules" bullet list, before any trailing
content):

```markdown
## Authentication rules

- All authenticated pages/routes validate the session server-side (`auth.api.getSession` via
  `auth/get-authenticated-user.ts`) — never rely solely on `proxy.ts`'s cookie-presence check.
- Never expose Keycloak access/refresh/ID tokens to Client Components or client-visible state.
- Never disable Better Auth's CSRF or origin checks (`disableCSRFCheck`/`disableOriginCheck`).
- Never use a wildcard trusted origin.
- Never persist auth tokens in local storage or session storage.
- Never accept an arbitrary, unvalidated callback or logout redirect — validate against an
  allowlist (see `auth/build-keycloak-logout-url.ts` and `config/env.server.ts`).
- All new shell/workspace routes use MUI components, per the existing MUI/Tailwind boundary
  rule above.
- The application context (module/organization/branch) stays a typed value
  (`config/application-context.ts`) — never an untyped/`any` blob.
- Profile and shell UI render only the sanitized `FinaxisUser` DTO
  (`auth/map-authenticated-user.ts`), never a raw Better Auth session or Keycloak claims object.
```

- [ ] **Step 5: Run `pnpm format:check`**

Run: `pnpm format:check`
Expected: clean (Prettier formats Markdown too, per `lint-staged`'s `*.{json,md,css}` rule).

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: update README and AGENTS.md for real Keycloak authentication

Replaces the mock-authentication section, updates the directory
listing and current-limitations bullets, and adds the authentication
rules AGENTS.md commits future work to.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: Default E2E suite — port update and unauthenticated protected-route tests

**Files:**

- Modify: `playwright.config.ts`
- Create: `e2e/protected-routes.spec.ts`

**Interfaces:** None — these are the outermost, black-box tests.

A note on scope, since this deliberately differs from a naive reading of the original brief:
authenticated-flow behavior (shell rendering, app switcher, drawer navigation, theme
persistence, profile content, logout) is already covered at the component level by the Vitest
suites in Tasks 12–22, and the _real_ authenticated protocol round trip is covered by Task 28's
Keycloak smoke test. There is no reliable way to forge a valid Better Auth stateless session
cookie from Playwright without either a real Keycloak login or reimplementing Better Auth's own
cookie-signing internals as a test fixture (fragile, and arguably duplicates the unit coverage
that already exists) — so the default suite stays limited to what's genuinely mockable:
unauthenticated redirects and the login page itself. This keeps `pnpm test:e2e` fully
Keycloak-independent per the earlier design decision, without pretending to cover authenticated
flows it can't actually exercise.

- [ ] **Step 1: Make the dev/test port environment-overridable**

In `playwright.config.ts`, change:

```ts
const PORT = 3000;
```

to:

```ts
const PORT = Number(process.env.PORT) || 3100;
```

- [ ] **Step 2: Add `package.json`'s `dev`/`start` scripts' port default**

Modify the `scripts` block in `package.json`:

```json
"dev": "next dev -p ${PORT:-3100}",
"start": "next start -p ${PORT:-3100}",
```

Run `pnpm dev` once manually afterward and confirm it prints `- Local: http://localhost:3100`.

- [ ] **Step 3: Write `e2e/protected-routes.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.describe('Protected routes without a session', () => {
  test('redirects /admin to /login with reason=session_expired', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });

  test('redirects a nested admin route to /login', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });

  test('redirects /profile to /login', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });
});
```

- [ ] **Step 4: Run the full E2E suite**

Run: `pnpm test:e2e`
Expected: all specs pass, including the pre-existing `e2e/login.spec.ts` (unaffected by the port
change since `playwright.config.ts`'s `baseURL` is derived from the same `PORT` constant used by
its `webServer.command`).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json e2e/protected-routes.spec.ts
git commit -m "$(cat <<'EOF'
test: default the dev/test port to 3100 and add unauthenticated E2E redirects

Verifies /admin, /admin/*, and /profile all redirect to
/login?reason=session_expired with no session cookie present —
Keycloak-independent, matching the default suite's scope.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: Real Keycloak smoke test (separate, manually invoked)

**Files:**

- Create: `e2e/keycloak-smoke.spec.ts`
- Modify: `package.json` (new `test:e2e:keycloak` script)
- Create: `playwright.keycloak.config.ts`

**Interfaces:** None — exercises the live system end-to-end; not part of the CI gate.

- [ ] **Step 1: Write `playwright.keycloak.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /keycloak-smoke\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write `e2e/keycloak-smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const KEYCLOAK_USERNAME = process.env.FINAXIS_LOCAL_USERNAME ?? 'local.admin';
const KEYCLOAK_PASSWORD = process.env.FINAXIS_LOCAL_PASSWORD ?? 'local-admin';

test.describe('Real Keycloak authentication (requires the platform docker compose stack)', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request
      .get('http://localhost:8080/realms/finaxis/.well-known/openid-configuration')
      .catch(() => null);
    test.skip(
      !response?.ok(),
      'Local Keycloak is not reachable on :8080 — start it with `docker compose up -d keycloak postgres` in the platform repo before running this smoke test.',
    );
  });

  test('completes the full login → shell → logout round trip', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue to Finaxis' }).click();

    await page.waitForURL(/realms\/finaxis\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username or email/i).fill(KEYCLOAK_USERNAME);
    await page.getByLabel('Password', { exact: true }).fill(KEYCLOAK_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('Administration')).toBeVisible();
    await expect(page.getByText(/greenfield sacco/i)).toBeVisible();

    await page.getByRole('link', { name: /^admin panel|switch application$/i }).first();
    await page.getByRole('button', { name: /switch application/i }).click();
    await expect(page.getByRole('menuitem', { name: /administration/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);

    await page.goto('/profile');
    await expect(page.getByText('No branches assigned')).toBeVisible();
    await expect(page.getByText('No application roles assigned')).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('button', { name: /jane muthoni|local admin|local\.admin/i }).click();
    const logoutButton = page.getByRole('button', { name: /log out/i });
    await Promise.all([page.waitForURL(/\/login\?reason=logged_out$/), logoutButton.click()]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });
});
```

The user-menu button's accessible name assertion (`/jane muthoni|local admin|local\.admin/i`)
covers whatever display name the real `local.admin` Keycloak user actually has — confirm the
exact name against the realm export (`platform/docker/keycloak/import/finaxis-realm.json`'s
`users` array) when this test is first run, and tighten the regex to the real value.

- [ ] **Step 3: Add the `package.json` script**

```json
"test:e2e:keycloak": "playwright test --config=playwright.keycloak.config.ts"
```

- [ ] **Step 4: Run it against the real stack**

Run:

```bash
cd /home/ogaba/finaxis/platform && docker compose up -d postgres keycloak && cd /home/ogaba/finaxis/finaxis-frontend
pnpm test:e2e:keycloak
```

Expected: the single smoke test passes end-to-end against the real local Keycloak. If Keycloak
isn't running, the `beforeAll` hook skips with an explicit, actionable message rather than
failing opaquely.

- [ ] **Step 5: Commit**

```bash
git add e2e/keycloak-smoke.spec.ts playwright.keycloak.config.ts package.json
git commit -m "$(cat <<'EOF'
test: add a separate, manually invoked real-Keycloak smoke test

Exercises the actual login redirect, shell rendering, drawer
navigation, profile empty states, and logout round trip against the
local finaxis realm — skips (not fails) when Keycloak isn't running,
and is never part of the default pnpm test:e2e gate.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 29: Full validation pass

**Files:** None — verification only.

**Interfaces:** None.

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm verify` (runs `check` + `test:coverage` + `build`, per `package.json`)
Expected: clean — zero ESLint warnings (`--max-warnings=0`), zero TypeScript errors, all Vitest
suites passing, coverage thresholds met (80% statements/functions/lines, 75% branches — extend
`vitest.config.ts`'s `coverage.include` array to add `'auth/**/*.ts'`, `'config/**/*.ts'`,
`'modules/**/*.ts'` alongside the existing `app/`, `components/`, `theme/` entries if coverage
reports these new directories as uncovered/missing), and a successful production build.

- [ ] **Step 2: Run the default E2E suite**

Run: `pnpm test:e2e`
Expected: all specs pass (login page, unauthenticated protected-route redirects).

- [ ] **Step 3: Run the real-Keycloak smoke test**

Run (with the platform's `postgres`/`keycloak` containers up):

```bash
pnpm test:e2e:keycloak
```

Expected: passes, or explicitly skips with the actionable message from Task 28 if Keycloak isn't
reachable in this run — report which one occurred honestly in the completion summary; never
claim it passed without having actually run it.

- [ ] **Step 4: Run `pnpm audit`**

Run: `pnpm audit --prod`
Expected: review the output. Fix any actionable **production** vulnerability by upgrading the
affected package within the existing major version if a patched release exists. Do not perform
unsafe major-version upgrades to fix an audit finding. Document any unresolved finding (package,
severity, why it's not fixed) in this task's completion notes rather than silently ignoring it.
Zero findings does not mean the app is secure — say so plainly rather than overclaiming.

- [ ] **Step 5: Manual verification checklist**

With `PORT=3100 pnpm dev` running and the platform's `postgres`/`keycloak` containers up, verify
each of the following by hand and record a pass/fail for each — do not claim any of these work
without actually clicking through them in a real browser:

- [ ] Clicking "Continue to Finaxis" on `/login` redirects to the real Keycloak login page.
- [ ] Logging in as `local.admin` returns to `/admin` and shows the app shell.
- [ ] Browser DevTools → Application → Cookies shows only `HttpOnly` cookies under the
      `finaxis.*` prefix — no token is readable from `document.cookie` in the console.
- [ ] `localStorage`/`sessionStorage` contain no auth tokens (check DevTools → Application).
- [ ] The user menu shows the signed-in user's name and email.
- [ ] `/profile` renders "No branches assigned" and "No application roles assigned".
- [ ] The theme menu's System default/Light/Dark selections all work with no hydration warning
      or color flash on reload.
- [ ] The mobile viewport (< 900px) shows the temporary Administration drawer via the mobile
      menu button, not a permanent one.
- [ ] Logging out via the user menu ends up back at `/login?reason=logged_out`.
- [ ] After logout, navigating to `/admin` redirects to `/login` again (no silent SSO
      re-authentication) — unless Keycloak's own SSO session policy intentionally allows it, in
      which case note that explicitly rather than treating it as a bug.
- [ ] No open redirect exists — manually try `POST /api/auth/logout` is unaffected by this check
      since it never reads a redirect target from user input in the first place; confirm by
      re-reading `app/api/auth/logout/route.ts`.
- [ ] No CORS wildcard exists anywhere (`grep -rn "Access-Control-Allow-Origin" app` should
      return nothing).
- [ ] No browser console errors or React hydration warnings appear on `/login`, `/admin`, or
      `/profile`.

- [ ] **Step 6: Final commit if any fixes were needed**

If Steps 1–5 required any code changes, commit them with a message describing exactly what was
fixed (e.g. `fix: add auth/config/modules to vitest coverage include`). If everything already
passed, there is nothing to commit for this task.
