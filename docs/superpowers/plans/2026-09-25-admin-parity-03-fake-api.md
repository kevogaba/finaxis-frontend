# PR 03: Standalone Fake API for E2E — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Replace the in-app backend fake with a standalone, zero-dependency fake API server that
Playwright starts, that mirrors the real backend's wire behaviour, and that isolates state per test;
migrate the existing E2E specs; remove the platform audit page that cannot work against the real API.

**Architecture:** `e2e/fake-api/*.mts` is a `node:http` server run under plain Node 24 (type
stripping). The Next dev server is pointed at it through `FINAXIS_API_URL`. The app's E2E mode
(`auth/e2e-test-mode.ts`) keeps only the session/token bypass: the bearer token it sends
(`e2e.<scenario>.<run>`) selects an isolated, scenario-seeded state inside the fake API.

**Tech Stack:** Node 24 `node:http` + type stripping, Playwright 1.63 (`webServer` list, `request`
fixture), Vitest.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §12 (fake API rules), D2,
D13; contract §A, §C, §E.1, §E.2.

## Global Constraints

See the index. Additionally, for everything under `e2e/fake-api/`:

- Runs under plain `node` — relative imports only with explicit `.mts` extensions, **no** `@/`
  aliases, no app-code or `server-only` imports.
- Erasable TypeScript only: no `enum`, `namespace`, parameter properties
  (`constructor(readonly x…)`), or `import =`. Type-only imports use `import type`.
- Mirrors the real backend (contract document): snake_case, `400 invalid_json` on unknown body
  properties, problem+json errors with `request_id`, page envelopes, context-token validation,
  permission checks, and the documented quirks. Never add behaviour the backend doesn't have.
- Grows per layer: each later layer adds only the endpoints it uses.

## Review Focus

Pins index item 1 at the fake-API level: an invalid or stale context token yields `403
invalid_active_tenant_context` (Task 3 spec "stale saved context").

---

### Task 1: Fake API core that boots under plain Node

**Files:**

- Modify: `tsconfig.json` (add `"allowImportingTsExtensions": true` to `compilerOptions`)
- Modify: `package.json` (add script `"fake-api": "node e2e/fake-api/server.mts"`)
- Create: `e2e/fake-api/http.mts`
- Create: `e2e/fake-api/router.mts`
- Create: `e2e/fake-api/context-token.mts`
- Create: `e2e/fake-api/state.mts`
- Create: `e2e/fake-api/scenarios.mts`
- Create: `e2e/fake-api/access.mts`
- Create: `e2e/fake-api/server.mts`
- Create: `e2e/fake-api.spec.ts`
- Modify: `playwright.config.ts` (full rewrite in Task 2 — this task only adds the fake API server
  entry so the spec can run)

**Interfaces:**

- Produces (used by every later layer's fake-API additions):
  - `http.mts`: `ProblemError`, `problem(status, code, detail, violations?)`,
    `sendJson(res, status, body, headers?)`, `sendNoContent(res)`, `sendProblem(res, instance,
problem)`, `readBody(req): Promise<unknown>`, `objectBody(body, allowedKeys): Record<string,
unknown>`, `pageOf(items, query)`, `stringField(body, key, { required })`.
  - `router.mts`: `route(method, path, handler)`, `matchRoute(routes, method, pathname)`, types
    `Route`, `Handler`, `RouteContext` (`{ req, res, params, query, state, path }`).
  - `context-token.mts`: `encodeContext(claims)`, `decodeContext(token)`, type `ContextClaims`.
  - `state.mts`: entity types (`FakeOrganisation`, `FakeUser`, `FakeMembership`, `FakeBranch`,
    `FakeBranchAssignment`, `FakeRole`, `FakeRoleAssignment`), `RunState`, `stateForToken(token)`.
  - `access.mts`: `PLATFORM_ORGANISATION_ID`, `requireContext(ctx)`, `requirePermission(access,
code)`, `requireTenantContext(access)`, `requirePlatformContext(access)`, `activeAssignmentRows(state,
userId, organisationId)`, type `AccessContext`.
  - `scenarios.mts`: `seedScenario(name)`, `SCENARIOS` (names), fixture ID constants.

- [ ] **Step 1: Allow `.mts` import specifiers in type-checking**

In `tsconfig.json` `compilerOptions`, add after `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

(Permitted because `noEmit` is set; Next's SWC compiler is unaffected.)

In `package.json` `scripts`, add after `"test:e2e:keycloak"`:

```json
    "fake-api": "node e2e/fake-api/server.mts",
```

- [ ] **Step 2: Write the failing smoke spec**

`e2e/fake-api.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;

function bearer(scenario = 'default') {
  return { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
}

test.describe('fake API', () => {
  test('is healthy', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/__health`);
    expect(response.status()).toBe(200);
  });

  test('rejects a missing bearer token with problem JSON', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`);
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      code: 'authentication_required',
      status: 401,
      violations: null,
    });
  });

  test('rejects an unknown scenario token with an empty 401 like an invalid JWT', async ({
    request,
  }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`, {
      headers: { Authorization: 'Bearer not-a-fake-token' },
    });
    expect(response.status()).toBe(401);
    expect(await response.text()).toBe('');
  });

  test('returns resource_not_found for unknown routes', async ({ request }) => {
    const response = await request.get(`${FAKE_API_URL}/api/v1/nope`, { headers: bearer() });
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'resource_not_found' });
  });

  test('rejects unknown and camelCase body properties with invalid_json', async ({ request }) => {
    const response = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
      headers: bearer(),
      data: { organisationId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_json' });
  });
});
```

- [ ] **Step 3: Add the fake API server to Playwright (temporary minimal edit)**

In `playwright.config.ts`, change `webServer: { … }` to a list whose first entry is:

```ts
    {
      command: 'node e2e/fake-api/server.mts',
      url: `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
```

followed by the existing dev-server object unchanged. (Task 2 rewrites the file.)

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm exec playwright test e2e/fake-api.spec.ts`
Expected: FAIL — web server `node e2e/fake-api/server.mts` exits (`Cannot find module`).

- [ ] **Step 5: Implement `e2e/fake-api/http.mts`**

```ts
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Violation {
  field: string;
  code: string;
  message: string;
}

export interface Problem {
  status: number;
  code: string;
  detail: string;
  violations?: Violation[] | null;
}

/** Thrown by handlers; rendered as problem+json by the server (mirrors ApiExceptionHandler). */
export class ProblemError extends Error {
  readonly problem: Problem;

  constructor(value: Problem) {
    super(value.detail);
    this.name = 'ProblemError';
    this.problem = value;
  }
}

export function problem(
  status: number,
  code: string,
  detail: string,
  violations: Violation[] | null = null,
): ProblemError {
  return new ProblemError({ status, code, detail, violations });
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Request-Id': randomUUID(),
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function sendNoContent(res: ServerResponse, headers: Record<string, string> = {}): void {
  res.writeHead(204, { 'X-Request-Id': randomUUID(), ...headers });
  res.end();
}

export function sendProblem(res: ServerResponse, instance: string, value: Problem): void {
  const requestId = randomUUID();
  res.writeHead(value.status, {
    'Content-Type': 'application/problem+json;charset=UTF-8',
    'X-Request-Id': requestId,
  });
  res.end(
    JSON.stringify({
      type: `urn:finaxis:problem:${value.code}`,
      title: TITLES[value.status] ?? 'Error',
      status: value.status,
      detail: value.detail,
      instance,
      code: value.code,
      request_id: requestId,
      violations: value.violations ?? null,
    }),
  );
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw problem(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

/** Mirrors ApiJsonCodec: a JSON object whose keys are all known snake_case properties. */
export function objectBody(body: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw problem(400, 'invalid_json', 'A JSON object body is required.');
  }
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw problem(400, 'invalid_json', `Unrecognized field "${unknownKey}".`);
  }
  return body as Record<string, unknown>;
}

export function stringField(
  body: Record<string, unknown>,
  key: string,
  options: { required: boolean },
): string | null {
  const value = body[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw problem(400, 'invalid_json', `Missing required field "${key}".`);
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw problem(400, 'invalid_json', `Field "${key}" must be a string.`);
  }
  return value;
}

function intParam(
  query: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = query.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw problem(400, 'validation_failed', `Invalid ${name}.`, [
      {
        field: name,
        code: 'invalid',
        message: `must be between ${String(min)} and ${String(max)}`,
      },
    ]);
  }
  return value;
}

export function pageOf<T>(items: readonly T[], query: URLSearchParams) {
  const number = intParam(query, 'page', 0, 0, Number.MAX_SAFE_INTEGER);
  const size = intParam(query, 'size', 25, 1, 100);
  const start = number * size;
  return {
    items: items.slice(start, start + size),
    page: {
      number,
      size,
      total_items: items.length,
      total_pages: Math.ceil(items.length / size),
      has_next: start + size < items.length,
      has_previous: number > 0,
    },
  };
}
```

- [ ] **Step 6: Implement `e2e/fake-api/router.mts`**

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RunState } from './state.mts';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  state: RunState;
  path: string;
}

export type Handler = (context: RouteContext) => Promise<void> | void;

export interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

/** `path` uses `:name` segments, e.g. `/api/v1/platform/tenants/:tenant_id`. */
export function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { method, pattern: new RegExp(`^${source}$`), keys, handler };
}

export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  for (const candidate of routes) {
    if (candidate.method !== method) {
      continue;
    }
    const match = candidate.pattern.exec(pathname);
    if (!match) {
      continue;
    }
    const params: Record<string, string> = {};
    candidate.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { route: candidate, params };
  }
  return null;
}
```

- [ ] **Step 7: Implement `e2e/fake-api/context-token.mts`**

```ts
/** Unsigned stand-in for the backend's signed context token (contract §A "Context"). */
export interface ContextClaims {
  userId: string;
  organisationId: string;
  membershipId: string;
  branchId: string | null;
}

const PREFIX = 'fake-ctx.';

export function encodeContext(claims: ContextClaims): string {
  return `${PREFIX}${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
}

export function decodeContext(token: string | undefined): ContextClaims | null {
  if (!token?.startsWith(PREFIX)) {
    return null;
  }
  try {
    const value = JSON.parse(
      Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'userId' in value &&
      typeof value.userId === 'string' &&
      'organisationId' in value &&
      typeof value.organisationId === 'string' &&
      'membershipId' in value &&
      typeof value.membershipId === 'string' &&
      'branchId' in value &&
      (typeof value.branchId === 'string' || value.branchId === null)
    ) {
      return {
        userId: value.userId,
        organisationId: value.organisationId,
        membershipId: value.membershipId,
        branchId: value.branchId,
      };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Implement `e2e/fake-api/state.mts`**

```ts
import { problem } from './http.mts';
import { seedScenario, SCENARIOS } from './scenarios.mts';

export interface FakeOrganisation {
  id: string;
  code: string;
  displayName: string;
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
  status: string;
  bootstrapStatus: string | null;
  bootstrapFailureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: string;
  keycloakSubject: string;
}

export interface FakeMembership {
  id: string;
  organisationId: string;
  userId: string;
  status: string;
  type: string;
  primaryBranchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeBranch {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  type: string;
  status: string;
  timezone: string;
  parentBranchId: string | null;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeBranchAssignment {
  id: string;
  organisationId: string;
  userId: string;
  branchId: string;
  type: string;
  status: string;
}

export interface FakeRole {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  status: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FakeRoleAssignment {
  id: string;
  organisationId: string;
  userId: string;
  roleId: string;
  scopeType: 'TENANT' | 'BRANCH';
  branchId: string | null;
  status: string;
}

/** One isolated backend per bearer token (`e2e.<scenario>.<run>`). Later layers add collections. */
export interface RunState {
  actorUserId: string;
  forbidOrganisationSelection: boolean;
  organisations: FakeOrganisation[];
  users: FakeUser[];
  memberships: FakeMembership[];
  branches: FakeBranch[];
  branchAssignments: FakeBranchAssignment[];
  roles: FakeRole[];
  roleAssignments: FakeRoleAssignment[];
}

const runs = new Map<string, RunState>();
const TOKEN_PATTERN = /^e2e\.([a-z0-9-]+)\.([A-Za-z0-9-]+)$/;

/**
 * Resolves (and on first use seeds) the state for a bearer token. An unknown shape or scenario
 * behaves like an invalid JWT: 401 with an empty body (contract §A "Auth").
 */
export function stateForToken(token: string): RunState {
  const match = TOKEN_PATTERN.exec(token);
  const scenario = match?.[1];
  if (!match || scenario === undefined || !SCENARIOS.includes(scenario)) {
    throw problem(401, 'invalid_token', '');
  }
  const existing = runs.get(token);
  if (existing) {
    return existing;
  }
  const seeded = seedScenario(scenario);
  runs.set(token, seeded);
  return seeded;
}
```

- [ ] **Step 9: Implement `e2e/fake-api/scenarios.mts`**

```ts
import type {
  FakeBranch,
  FakeBranchAssignment,
  FakeMembership,
  FakeOrganisation,
  FakeRole,
  FakeRoleAssignment,
  FakeUser,
  RunState,
} from './state.mts';

export const IDS = {
  platformOrganisation: '00000000-0000-0000-0000-000000000000',
  greenfield: '11111111-1111-4111-8111-111111111111',
  headOffice: '22222222-2222-4222-8222-222222222222',
  greenfieldMembership: '33333333-3333-4333-8333-333333333333',
  westlands: '44444444-4444-4444-8444-444444444444',
  jane: '55555555-5555-4555-8555-555555555555',
  tenantAdminRole: '66666666-6666-4666-8666-666666666666',
  platformOperations: '77777777-7777-4777-8777-777777777777',
  platformMembership: '88888888-8888-4888-8888-888888888888',
  acme: '99999999-9999-4999-8999-999999999999',
  platformAdminRole: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const;

const CREATED = '2026-07-01T08:00:00Z';
const UPDATED = '2026-07-24T08:00:00Z';

export const TENANT_ADMIN_PERMISSIONS = [
  'iam.profile.read',
  'auth.select_organisation',
  'auth.select_branch',
  'tenant.view',
  'user.view',
  'membership.view',
  'branch.view',
  'branch_assignment.view',
  'role.view',
  'role_assignment.view',
  'permission.view',
  'audit.view',
  'settings.view',
  'business_date.view',
];

export const PLATFORM_ADMIN_PERMISSIONS = [
  'iam.profile.read',
  'auth.select_organisation',
  'auth.select_branch',
  'tenant.view',
  'branch.view',
  'user.view',
];

const jane: FakeUser = {
  id: IDS.jane,
  username: 'jane.manager',
  email: 'backend.jane@greenfield.example',
  displayName: 'Backend Jane Manager',
  status: 'ACTIVE',
  keycloakSubject: 'e2e-keycloak-subject',
};

function organisation(
  id: string,
  code: string,
  displayName: string,
  overrides: Partial<FakeOrganisation> = {},
): FakeOrganisation {
  return {
    id,
    code,
    displayName,
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status: 'ACTIVE',
    bootstrapStatus: 'COMPLETED',
    bootstrapFailureCode: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function branch(
  id: string,
  organisationId: string,
  code: string,
  name: string,
  type: string,
): FakeBranch {
  return {
    id,
    organisationId,
    code,
    name,
    type,
    status: 'ACTIVE',
    timezone: 'Africa/Nairobi',
    parentBranchId: null,
    statusReason: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function membership(id: string, organisationId: string, userId: string): FakeMembership {
  return {
    id,
    organisationId,
    userId,
    status: 'ACTIVE',
    type: 'ADMIN',
    primaryBranchId: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function assignment(
  id: string,
  organisationId: string,
  userId: string,
  branchId: string,
  type: string,
): FakeBranchAssignment {
  return { id, organisationId, userId, branchId, type, status: 'ACTIVE' };
}

function role(
  id: string,
  organisationId: string,
  code: string,
  name: string,
  permissions: string[],
): FakeRole {
  return {
    id,
    organisationId,
    code,
    name,
    description: null,
    systemRole: true,
    status: 'ACTIVE',
    permissions,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function tenantRoleAssignment(
  id: string,
  organisationId: string,
  userId: string,
  roleId: string,
): FakeRoleAssignment {
  return {
    id,
    organisationId,
    userId,
    roleId,
    scopeType: 'TENANT',
    branchId: null,
    status: 'ACTIVE',
  };
}

function greenfieldTenant(): RunState {
  return {
    actorUserId: IDS.jane,
    forbidOrganisationSelection: false,
    organisations: [organisation(IDS.greenfield, 'greenfield', 'Greenfield SACCO')],
    users: [jane],
    memberships: [membership(IDS.greenfieldMembership, IDS.greenfield, IDS.jane)],
    branches: [
      branch(IDS.headOffice, IDS.greenfield, 'HEAD_OFFICE', 'Head Office', 'HEAD_OFFICE'),
      branch(IDS.westlands, IDS.greenfield, 'WESTLANDS', 'Westlands Branch', 'OPERATIONS'),
    ],
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000001',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'HOME',
      ),
      assignment(
        'b0000000-0000-4000-8000-000000000002',
        IDS.greenfield,
        IDS.jane,
        IDS.westlands,
        'OPERATE',
      ),
    ],
    roles: [
      role(
        IDS.tenantAdminRole,
        IDS.greenfield,
        'TENANT_ADMIN',
        'Tenant admin',
        TENANT_ADMIN_PERMISSIONS,
      ),
    ],
    roleAssignments: [
      tenantRoleAssignment(
        'c0000000-0000-4000-8000-000000000001',
        IDS.greenfield,
        IDS.jane,
        IDS.tenantAdminRole,
      ),
    ],
  };
}

function platformOperator(): RunState {
  return {
    actorUserId: IDS.jane,
    forbidOrganisationSelection: false,
    organisations: [
      organisation(IDS.platformOrganisation, 'PLATFORM', 'Platform', {
        countryCode: 'ZZ',
        baseCurrencyCode: 'XXX',
        timezone: 'UTC',
        bootstrapStatus: null,
      }),
      organisation(IDS.acme, 'acme', 'Acme SACCO'),
    ],
    users: [jane],
    memberships: [membership(IDS.platformMembership, IDS.platformOrganisation, IDS.jane)],
    branches: [
      branch(
        IDS.platformOperations,
        IDS.platformOrganisation,
        'PLATFORM_OPS',
        'Platform Operations',
        'HEAD_OFFICE',
      ),
    ],
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000003',
        IDS.platformOrganisation,
        IDS.jane,
        IDS.platformOperations,
        'HOME',
      ),
    ],
    roles: [
      role(
        IDS.platformAdminRole,
        IDS.platformOrganisation,
        'PLATFORM_SUPER_ADMIN',
        'Platform super admin',
        PLATFORM_ADMIN_PERMISSIONS,
      ),
    ],
    roleAssignments: [
      tenantRoleAssignment(
        'c0000000-0000-4000-8000-000000000002',
        IDS.platformOrganisation,
        IDS.jane,
        IDS.platformAdminRole,
      ),
    ],
  };
}

const BUILDERS: Record<string, () => RunState> = {
  default: greenfieldTenant,
  'empty-organisations': () => ({ ...greenfieldTenant(), memberships: [] }),
  'selection-forbidden': () => ({ ...greenfieldTenant(), forbidOrganisationSelection: true }),
  'platform-operator': platformOperator,
};

export const SCENARIOS: readonly string[] = Object.keys(BUILDERS);

export function seedScenario(name: string): RunState {
  const build = BUILDERS[name];
  if (!build) {
    throw new Error(`Unknown fake API scenario "${name}".`);
  }
  return build();
}
```

(Run `pnpm exec prettier --write e2e/fake-api` after creating the files — the long fixture lines
above are wrapped by Prettier.)

- [ ] **Step 10: Implement `e2e/fake-api/access.mts`**

```ts
import { decodeContext } from './context-token.mts';
import type { ContextClaims } from './context-token.mts';
import { problem } from './http.mts';
import type { RouteContext } from './router.mts';
import type { FakeBranchAssignment, FakeMembership, FakeOrganisation, RunState } from './state.mts';

export const PLATFORM_ORGANISATION_ID = '00000000-0000-0000-0000-000000000000';

export interface AccessContext {
  state: RunState;
  claims: ContextClaims;
  organisation: FakeOrganisation;
  membership: FakeMembership;
  permissions: ReadonlySet<string>;
}

/** ACTIVE assignment rows on ACTIVE branches — one row per assignment, so branches can repeat. */
export function activeAssignmentRows(
  state: RunState,
  userId: string,
  organisationId: string,
): FakeBranchAssignment[] {
  return state.branchAssignments.filter(
    (row) =>
      row.userId === userId &&
      row.organisationId === organisationId &&
      row.status === 'ACTIVE' &&
      state.branches.some((branch) => branch.id === row.branchId && branch.status === 'ACTIVE'),
  );
}

function effectivePermissions(state: RunState, claims: ContextClaims): Set<string> {
  const permissions = new Set<string>();
  for (const assignment of state.roleAssignments) {
    if (
      assignment.userId !== claims.userId ||
      assignment.organisationId !== claims.organisationId ||
      assignment.status !== 'ACTIVE'
    ) {
      continue;
    }
    if (assignment.scopeType === 'BRANCH' && assignment.branchId !== claims.branchId) {
      continue;
    }
    const role = state.roles.find((candidate) => candidate.id === assignment.roleId);
    if (role?.status === 'ACTIVE') {
      role.permissions.forEach((code) => permissions.add(code));
    }
  }
  return permissions;
}

const invalidContext = () =>
  problem(403, 'invalid_active_tenant_context', 'The active organisation context is invalid.');

/** Mirrors SecurityConfiguration's per-request context re-validation (contract §A "Context"). */
export function requireContext({ req, state }: RouteContext): AccessContext {
  const header = req.headers['x-active-organisation-context'];
  const claims = decodeContext(Array.isArray(header) ? header[0] : header);
  if (!claims || claims.userId !== state.actorUserId) {
    throw invalidContext();
  }
  const membership = state.memberships.find((candidate) => candidate.id === claims.membershipId);
  const organisation = state.organisations.find(
    (candidate) => candidate.id === claims.organisationId,
  );
  if (membership?.status !== 'ACTIVE' || organisation?.status !== 'ACTIVE') {
    throw invalidContext();
  }
  if (
    claims.branchId !== null &&
    !activeAssignmentRows(state, claims.userId, claims.organisationId).some(
      (row) => row.branchId === claims.branchId,
    )
  ) {
    throw invalidContext();
  }
  return {
    state,
    claims,
    organisation,
    membership,
    permissions: effectivePermissions(state, claims),
  };
}

export function requirePermission(access: AccessContext, code: string): void {
  if (!access.permissions.has(code)) {
    throw problem(403, 'forbidden', 'Access is denied.');
  }
}

export function requirePlatformContext(access: AccessContext): void {
  if (access.organisation.id !== PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'Reserved platform organisation context is required for this route.',
      'Access is denied.',
    );
  }
}

export function requireTenantContext(access: AccessContext): void {
  if (access.organisation.id === PLATFORM_ORGANISATION_ID) {
    throw problem(
      403,
      'Branch operations are restricted to non-platform tenant context.',
      'Access is denied.',
    );
  }
}
```

- [ ] **Step 11: Implement `e2e/fake-api/server.mts`**

```ts
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProblemError, problem, sendJson, sendProblem } from './http.mts';
import { matchRoute } from './router.mts';
import type { Route } from './router.mts';
import { stateForToken } from './state.mts';

/** Each layer appends its route list here. */
const routes: Route[] = [];

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://fake-api.local');
  if (url.pathname === '/__health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw problem(401, 'authentication_required', 'Authentication is required.');
    }
    const state = stateForToken(authorization.slice('Bearer '.length));
    const match = matchRoute(routes, req.method ?? 'GET', url.pathname);
    if (!match) {
      throw problem(404, 'resource_not_found', 'No route matches this request.');
    }
    await match.route.handler({
      req,
      res,
      params: match.params,
      query: url.searchParams,
      state,
      path: url.pathname,
    });
  } catch (error) {
    if (error instanceof ProblemError) {
      if (error.problem.code === 'invalid_token') {
        // Invalid/expired JWT: empty 401 body, like the real resource server.
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
        res.end();
        return;
      }
      sendProblem(res, url.pathname, error.problem);
      return;
    }
    console.error(error);
    sendProblem(res, url.pathname, {
      status: 500,
      code: 'internal_error',
      detail: 'An unexpected error occurred.',
    });
  }
}

const port = Number(process.env.FAKE_API_PORT ?? '3199');
const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`fake API listening on http://127.0.0.1:${String(port)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
```

- [ ] **Step 12: Boot under plain Node, then run the spec**

```bash
pnpm exec prettier --write e2e/fake-api
node e2e/fake-api/server.mts &
sleep 1
curl -s http://127.0.0.1:3199/__health
kill %1
pnpm exec playwright test e2e/fake-api.spec.ts
```

Expected: `{"status":"ok"}`; the spec's first four tests PASS and the `select-organisation` test
FAILS with 404 (no auth routes yet — Task 2).

- [ ] **Step 13: Typecheck and lint the fake API**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. Fix any `import type` omissions or non-erasable syntax the linter/typechecker
reports; re-run Step 12's boot check after each fix.

- [ ] **Step 14: Commit**

```bash
git add tsconfig.json package.json e2e/fake-api e2e/fake-api.spec.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): add a standalone fake API core that boots under plain Node

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Auth routes, app-side E2E bypass slimmed, Playwright wiring

**Files:**

- Create: `e2e/fake-api/routes/auth.mts`
- Modify: `e2e/fake-api/server.mts` (register `authRoutes`)
- Create: `e2e/support/auth.ts`
- Modify: `playwright.config.ts` (full rewrite)
- Modify: `auth/e2e-test-mode.ts` (full rewrite)
- Modify: `auth/e2e-test-mode.test.ts` (full rewrite)
- Modify: `auth/backend-api.ts` (drop the in-app fake branch)
- Modify: `e2e/fake-api.spec.ts` (auth assertions)

**Interfaces:**

- Consumes: Task 1 exports.
- Produces:
  - Fake endpoints: `GET /api/v1/auth/organisations`, `POST /api/v1/auth/select-organisation`,
    `GET /api/v1/auth/branches`, `POST /api/v1/auth/select-branch`, `GET /api/v1/auth/me`.
  - `e2e/support/auth.ts`: `SESSION_COOKIE_NAME`, `SESSION_COOKIE_VALUE`, `RUN_COOKIE_NAME`,
    `CONTEXT_COOKIE_NAME`, `type FakeApiScenario`, `baseUrl(testInfo)`, `addCookie(context,
testInfo, name, value)`, `authenticate(context, testInfo, scenario?) → Promise<string>` (the run
    id), `selectMuiOption(page, label, option)`.
  - App: `E2E_RUN_COOKIE_NAME = 'finaxis_e2e_run'`; `getE2eAccessToken(headers)` returns
    `e2e.<scenario>.<run>` (default `e2e.default.shared`); `getE2eBackendResult` no longer exists.

- [ ] **Step 1: Extend the smoke spec with auth expectations (failing)**

Append to `e2e/fake-api.spec.ts` inside the `describe`:

```ts
test('selects a multi-branch organisation and requires a branch', async ({ request }) => {
  const headers = bearer();
  const organisations = await request.get(`${FAKE_API_URL}/api/v1/auth/organisations`, {
    headers,
  });
  expect(await organisations.json()).toMatchObject({
    items: [{ display_name: 'Greenfield SACCO', tenant_code: 'greenfield' }],
    page: { number: 0, size: 25, total_items: 1, total_pages: 1 },
  });

  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers,
    data: { organisation_id: '11111111-1111-4111-8111-111111111111' },
  });
  const body = (await selection.json()) as {
    context_token: string;
    requires_branch_selection: boolean;
    branch_id: string | null;
  };
  expect(body.requires_branch_selection).toBe(true);
  expect(body.branch_id).toBeNull();

  const profile = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, {
    headers: { ...headers, 'X-Active-Organisation-Context': body.context_token },
  });
  expect(await profile.json()).toMatchObject({
    full_name: 'Backend Jane Manager',
    selected_branch: null,
    organisation: { name: 'Greenfield SACCO' },
  });
});

test('treats a stale context token as invalid_active_tenant_context', async ({ request }) => {
  const response = await request.get(`${FAKE_API_URL}/api/v1/auth/me`, {
    headers: { ...bearer(), 'X-Active-Organisation-Context': 'stale-context-token' },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'invalid_active_tenant_context' });
});
```

Run: `pnpm exec playwright test e2e/fake-api.spec.ts` → the two new tests FAIL (404).

- [ ] **Step 2: Implement `e2e/fake-api/routes/auth.mts`**

```ts
import { encodeContext } from '../context-token.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { activeAssignmentRows, requireContext, requirePermission } from '../access.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch, RunState } from '../state.mts';

function profileBranch(branch: FakeBranch) {
  return { id: branch.id, code: branch.code, name: branch.name, status: branch.status };
}

function branchRows(state: RunState, userId: string, organisationId: string): FakeBranch[] {
  return activeAssignmentRows(state, userId, organisationId)
    .map((row) => state.branches.find((branch) => branch.id === row.branchId))
    .filter((branch): branch is FakeBranch => branch !== undefined)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export const authRoutes: Route[] = [
  route('GET', '/api/v1/auth/organisations', ({ res, query, state }) => {
    const items = state.memberships
      .filter(
        (membership) => membership.userId === state.actorUserId && membership.status === 'ACTIVE',
      )
      .flatMap((membership) => {
        const organisation = state.organisations.find(
          (candidate) =>
            candidate.id === membership.organisationId && candidate.status === 'ACTIVE',
        );
        return organisation
          ? [
              {
                organisation_id: organisation.id,
                membership_id: membership.id,
                tenant_code: organisation.code,
                display_name: organisation.displayName,
                organisation_status: organisation.status,
                membership_status: membership.status,
              },
            ]
          : [];
      });
    sendJson(res, 200, pageOf(items, query));
  }),

  route('POST', '/api/v1/auth/select-organisation', async ({ req, res, state }) => {
    const body = objectBody(await readBody(req), ['organisation_id']);
    const organisationId = stringField(body, 'organisation_id', { required: true }) ?? '';
    const membership = state.memberships.find(
      (candidate) =>
        candidate.organisationId === organisationId &&
        candidate.userId === state.actorUserId &&
        candidate.status === 'ACTIVE',
    );
    if (state.forbidOrganisationSelection || !membership) {
      throw problem(403, 'forbidden', 'Access is denied.');
    }
    const assigned = activeAssignmentRows(state, state.actorUserId, organisationId)
      .map((row) => row.branchId)
      .sort();
    const branchId = assigned.length === 1 ? (assigned[0] ?? null) : null;
    sendJson(res, 200, {
      organisation_id: organisationId,
      membership_id: membership.id,
      context_token: encodeContext({
        userId: state.actorUserId,
        organisationId,
        membershipId: membership.id,
        branchId,
      }),
      context_header: 'X-Active-Organisation-Context',
      branch_id: branchId,
      requires_branch_selection: assigned.length > 1,
      assigned_branch_ids: assigned,
    });
  }),

  route('GET', '/api/v1/auth/branches', (context) => {
    const access = requireContext(context);
    requirePermission(access, 'auth.select_branch');
    const items = branchRows(context.state, access.claims.userId, access.claims.organisationId).map(
      (branch) => ({
        branch_id: branch.id,
        branch_code: branch.code,
        branch_name: branch.name,
        branch_status: branch.status,
      }),
    );
    sendJson(context.res, 200, pageOf(items, context.query));
  }),

  route('POST', '/api/v1/auth/select-branch', async (context) => {
    const access = requireContext(context);
    requirePermission(access, 'auth.select_branch');
    const body = objectBody(await readBody(context.req), ['branch_id']);
    const branchId = stringField(body, 'branch_id', { required: true }) ?? '';
    const allowed = activeAssignmentRows(
      context.state,
      access.claims.userId,
      access.claims.organisationId,
    ).some((row) => row.branchId === branchId);
    if (!allowed) {
      throw problem(403, 'forbidden', 'Access is denied.');
    }
    sendJson(context.res, 200, {
      organisation_id: access.claims.organisationId,
      membership_id: access.claims.membershipId,
      branch_id: branchId,
      context_token: encodeContext({ ...access.claims, branchId }),
      context_header: 'X-Active-Organisation-Context',
    });
  }),

  route('GET', '/api/v1/auth/me', (context) => {
    const access = requireContext(context);
    requirePermission(access, 'iam.profile.read');
    const { state } = context;
    const user = state.users.find((candidate) => candidate.id === access.claims.userId);
    if (!user) {
      throw problem(404, 'resource_not_found', 'User not found.');
    }
    const branches = branchRows(state, user.id, access.organisation.id);
    const selected = state.branches.find((branch) => branch.id === access.claims.branchId);
    const roles = state.roleAssignments
      .filter(
        (assignment) =>
          assignment.userId === user.id &&
          assignment.organisationId === access.organisation.id &&
          assignment.status === 'ACTIVE',
      )
      .flatMap((assignment) => state.roles.filter((role) => role.id === assignment.roleId))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((role) => ({ id: role.id, code: role.code, name: role.name, status: role.status }));
    sendJson(context.res, 200, {
      user_id: user.id,
      keycloak_subject: user.keycloakSubject,
      email: user.email,
      full_name: user.displayName,
      organisation: {
        id: access.organisation.id,
        code: access.organisation.code,
        name: access.organisation.displayName,
        status: access.organisation.status,
      },
      membership: { id: access.membership.id, status: access.membership.status },
      selected_branch: selected ? profileBranch(selected) : null,
      branches: branches.map(profileBranch),
      roles,
      permissions: [...access.permissions].sort(),
    });
  }),
];
```

Register in `server.mts`:

```ts
import { authRoutes } from './routes/auth.mts';
// …
const routes: Route[] = [...authRoutes];
```

Run: `pnpm exec prettier --write e2e/fake-api && pnpm exec playwright test e2e/fake-api.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 3: Write the failing unit test for the slimmed app-side bypass**

Replace `auth/e2e-test-mode.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_RUN_COOKIE_NAME,
  E2E_SESSION_COOKIE_NAME,
  E2E_SESSION_COOKIE_VALUE,
  getE2eAccessToken,
  getE2eAuthenticatedUser,
  getE2eBetterAuthSession,
} from './e2e-test-mode';

function headersWith(cookies: Record<string, string>) {
  return new Headers({
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
  });
}

const session = { [E2E_SESSION_COOKIE_NAME]: E2E_SESSION_COOKIE_VALUE };

describe('e2e test mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is inert unless FINAXIS_E2E_TEST_MODE=1 outside production', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
    expect(getE2eAccessToken(headersWith(session))).toBeNull();
    expect(getE2eBetterAuthSession(headersWith(session))).toBeNull();
  });

  it('requires the e2e session cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAccessToken(new Headers())).toBeNull();
    expect(getE2eAuthenticatedUser(new Headers())).toBeNull();
  });

  it('derives the fake-API bearer token from the run cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(
      getE2eAccessToken(
        headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'platform-operator.run-1' }),
      ),
    ).toBe('e2e.platform-operator.run-1');
  });

  it('falls back to the shared default run for a missing or malformed run cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAccessToken(headersWith(session))).toBe('e2e.default.shared');
    expect(getE2eAccessToken(headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'x;y' }))).toBe(
      'e2e.default.shared',
    );
  });

  it('provides a Better Auth-shaped session and a sanitized user', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eBetterAuthSession(headersWith(session))?.session.token).toBe(
      E2E_SESSION_COOKIE_VALUE,
    );
    expect(getE2eAuthenticatedUser(headersWith(session))).toMatchObject({
      email: 'e2e.session@greenfield.example',
      permissions: [],
    });
  });
});
```

Run: `pnpm test:run auth/e2e-test-mode.test.ts` → FAIL (`E2E_RUN_COOKIE_NAME` not exported).

- [ ] **Step 4: Rewrite `auth/e2e-test-mode.ts`**

```ts
import 'server-only';
import type { FinaxisUser } from '@/auth/auth.types';

export const E2E_SESSION_COOKIE_NAME = 'finaxis.session_token';
export const E2E_SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
/**
 * Names the fake-API run for this browser context: `<scenario>.<run id>`. The fake API
 * (e2e/fake-api) seeds an isolated backend per bearer token derived from it.
 */
export const E2E_RUN_COOKIE_NAME = 'finaxis_e2e_run';

const DEFAULT_RUN = 'default.shared';
const RUN_PATTERN = /^[a-z0-9-]+\.[A-Za-z0-9-]+$/;

export interface E2eBetterAuthSession {
  session: {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    token: string;
    updatedAt: Date;
    userId: string;
  };
  user: {
    createdAt: Date;
    email: string;
    emailVerified: boolean;
    id: string;
    image: string | null;
    name: string;
    updatedAt: Date;
  };
}

function isE2eTestMode(): boolean {
  return process.env.FINAXIS_E2E_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
}

function cookieValue(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => {
      const separator = value.indexOf('=');
      return separator > 0 && value.slice(0, separator) === name;
    });

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  } catch {
    return null;
  }
}

function hasE2eSession(headers: Headers): boolean {
  return cookieValue(headers, E2E_SESSION_COOKIE_NAME) === E2E_SESSION_COOKIE_VALUE;
}

export function getE2eAuthenticatedUser(headers: Headers): FinaxisUser | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  return {
    branches: [],
    email: 'e2e.session@greenfield.example',
    id: 'e2e-session-user',
    name: 'E2E Session User',
    permissions: [],
    roles: [],
  };
}

/** Bearer token sent to the fake API; never a real Keycloak token. */
export function getE2eAccessToken(headers: Headers): string | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  const run = cookieValue(headers, E2E_RUN_COOKIE_NAME);
  return `e2e.${run !== null && RUN_PATTERN.test(run) ? run : DEFAULT_RUN}`;
}

export function getE2eBetterAuthSession(headers: Headers): E2eBetterAuthSession | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  const createdAt = new Date('2026-07-26T00:00:00.000Z');
  const expiresAt = new Date('2026-07-26T08:00:00.000Z');

  return {
    session: {
      createdAt,
      expiresAt,
      id: 'e2e-session-id',
      token: E2E_SESSION_COOKIE_VALUE,
      updatedAt: createdAt,
      userId: 'e2e-session-user',
    },
    user: {
      createdAt,
      email: 'e2e.session@greenfield.example',
      emailVerified: true,
      id: 'e2e-session-user',
      image: null,
      name: 'E2E Session User',
      updatedAt: createdAt,
    },
  };
}
```

In `auth/backend-api.ts`: change the import to `import { getE2eAccessToken } from
'@/auth/e2e-test-mode';` and delete the six lines at the top of `request()` that call
`getE2eBackendResult` (the `e2eResult` block). Run `pnpm test:run auth/` → PASS.

- [ ] **Step 5: Create `e2e/support/auth.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

export const SESSION_COOKIE_NAME = 'finaxis.session_token';
export const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
export const RUN_COOKIE_NAME = 'finaxis_e2e_run';
export const CONTEXT_COOKIE_NAME = 'finaxis_context';

/** Mirrors `SCENARIOS` in e2e/fake-api/scenarios.mts. */
export type FakeApiScenario =
  'default' | 'empty-organisations' | 'selection-forbidden' | 'platform-operator';

export function baseUrl(testInfo: TestInfo): string {
  const configured = testInfo.project.use.baseURL;
  if (typeof configured !== 'string') {
    throw new Error('Playwright baseURL must be configured for e2e auth fixtures.');
  }
  return configured;
}

export async function addCookie(
  context: BrowserContext,
  testInfo: TestInfo,
  name: string,
  value: string,
): Promise<void> {
  await context.addCookies([
    { httpOnly: true, name, sameSite: 'Lax', secure: false, url: baseUrl(testInfo), value },
  ]);
}

/** Signs the browser in (E2E bypass) against a fresh, isolated fake-API run. */
export async function authenticate(
  context: BrowserContext,
  testInfo: TestInfo,
  scenario: FakeApiScenario = 'default',
): Promise<string> {
  const run = `${scenario}.${randomUUID()}`;
  await addCookie(context, testInfo, SESSION_COOKIE_NAME, SESSION_COOKIE_VALUE);
  await addCookie(context, testInfo, RUN_COOKIE_NAME, run);
  return run;
}

export async function selectMuiOption(page: Page, label: string, option: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}
```

- [ ] **Step 6: Rewrite `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;
const FAKE_API_PORT = process.env.FAKE_API_PORT ?? '3199';
const FAKE_API_URL = `http://127.0.0.1:${FAKE_API_PORT}`;
process.env.FINAXIS_E2E_TEST_MODE = '1';

export default defineConfig({
  testDir: './e2e',
  // The real-Keycloak smoke test is separate and manually invoked via
  // `pnpm test:e2e:keycloak` (playwright.keycloak.config.ts).
  testIgnore: /keycloak-smoke\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Zero-dependency fake of the platform API (e2e/fake-api); state is isolated per test run.
      command: 'node e2e/fake-api/server.mts',
      env: { FAKE_API_PORT },
      url: `${FAKE_API_URL}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Non-production dev server so the gated E2E session bypass works; all backend calls go to
      // the fake API. PLATFORM_ORGANISATION_ID matches the fake API's reserved organisation.
      command: 'pnpm dev',
      env: {
        ...process.env,
        FINAXIS_E2E_TEST_MODE: '1',
        FINAXIS_API_URL: FAKE_API_URL,
        PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
```

Note for local runs: stop any `pnpm dev` pointed at the real dev API first — `reuseExistingServer`
would otherwise reuse it.

- [ ] **Step 7: Run unit tests and the smoke spec, then commit**

Run: `pnpm test:run && pnpm exec playwright test e2e/fake-api.spec.ts`
Expected: PASS.

```bash
pnpm exec prettier --write e2e
git add e2e auth/e2e-test-mode.ts auth/e2e-test-mode.test.ts auth/backend-api.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): serve auth endpoints from the fake API and slim the in-app bypass

The app's E2E mode now only bypasses Better Auth and names a fake-API run; every backend call goes
through the real fetch path to the standalone fake API.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Platform tenant routes, spec migration, platform audit removal

**Files:**

- Create: `e2e/fake-api/routes/platform-tenants.mts`
- Modify: `e2e/fake-api/server.mts` (register `platformTenantRoutes`)
- Modify: `e2e/protected-routes.spec.ts`, `e2e/context-selection.spec.ts`,
  `e2e/platform-administration.spec.ts` (use `e2e/support/auth.ts`; real enum values)
- Delete: `app/(authenticated)/platform-admin/audit/page.tsx`, `…/audit/page.test.tsx`,
  `modules/platform-administration/components/audit-event-table.tsx`, `…/audit-event-table.test.tsx`
- Modify: `modules/platform-administration/platform-administration-navigation.ts` (drop the audit
  item), `…-service.ts` (drop `listAuditEvents`, `getAuditEvent`), `…-service.test.ts`,
  `…-mappers.ts` / `…-mappers.test.ts` (drop audit mappers), `…-queries.ts` / `…-queries.test.ts`
  (drop `parseAuditListQuery`, `safeParseAuditListQuery`), `…-administration.types.ts` (drop
  `AuditEvent`, `AuditEventDetail`, `AuditListQuery`), `app/(authenticated)/platform-admin/page.tsx`
  (drop the "Audit visibility" card) and its test, `app/select-context/page.tsx` and
  `components/context/context-selection-page.tsx` (drop `'/platform-admin/audit'` from the
  destination list and type)
- Modify: `.github/workflows/ci.yml` (`PLATFORM_ORGANISATION_ID` → the reserved nil UUID; comment)

**Interfaces:**

- Consumes: Tasks 1–2.
- Produces: fake `GET /api/v1/platform/tenants`, `GET /api/v1/platform/tenants/:tenant_id`
  (contract §E.2 semantics: `q`, `status`, `country`, `created_from/to`, camelCase `sort_by`
  allow-list with 500 otherwise, case-insensitive `sort_dir`).

- [ ] **Step 1: Implement `e2e/fake-api/routes/platform-tenants.mts`**

```ts
import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import { pageOf, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeOrganisation } from '../state.mts';

const SORTS: Record<string, (tenant: FakeOrganisation) => string> = {
  tenantCode: (tenant) => tenant.code,
  displayName: (tenant) => tenant.displayName,
  countryCode: (tenant) => tenant.countryCode,
  createdAt: (tenant) => tenant.createdAt,
};

/** Mirrors FoundationQueryService.validateSort: unknown sort → 500 internal_error. */
function sortTenants(tenants: FakeOrganisation[], query: URLSearchParams): FakeOrganisation[] {
  const sortBy = query.get('sort_by') ?? 'createdAt';
  const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
  const key = SORTS[sortBy];
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw problem(500, 'internal_error', 'An unexpected error occurred.');
  }
  const sorted = [...tenants].sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? sorted.reverse() : sorted;
}

function summary(tenant: FakeOrganisation) {
  return {
    id: tenant.id,
    tenant_code: tenant.code,
    display_name: tenant.displayName,
    country_code: tenant.countryCode,
    status: tenant.status,
    created_at: tenant.createdAt,
  };
}

function detail(tenant: FakeOrganisation) {
  return {
    ...summary(tenant),
    base_currency_code: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    bootstrap_status: tenant.bootstrapStatus,
    bootstrap_failure_code: tenant.bootstrapFailureCode,
    updated_at: tenant.updatedAt,
  };
}

export const platformTenantRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants', (context) => {
    const access = requireContext(context);
    requirePlatformContext(access);
    requirePermission(access, 'tenant.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const country = query.get('country');
    const createdFrom = query.get('created_from');
    const createdTo = query.get('created_to');
    const tenants = context.state.organisations.filter(
      (tenant) =>
        (!q ||
          tenant.code.toLowerCase().includes(q) ||
          tenant.displayName.toLowerCase().includes(q)) &&
        (!status || tenant.status === status) &&
        (!country || tenant.countryCode === country) &&
        (!createdFrom || tenant.createdAt >= createdFrom) &&
        (!createdTo || tenant.createdAt <= createdTo),
    );
    sendJson(context.res, 200, pageOf(sortTenants(tenants, query).map(summary), query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id', (context) => {
    const access = requireContext(context);
    requirePlatformContext(access);
    requirePermission(access, 'tenant.view');
    const tenant = context.state.organisations.find(
      (candidate) => candidate.id === context.params.tenant_id,
    );
    if (!tenant) {
      throw problem(404, 'resource_not_found', 'Tenant not found.');
    }
    sendJson(context.res, 200, detail(tenant));
  }),
];
```

Register in `server.mts`: `const routes: Route[] = [...authRoutes, ...platformTenantRoutes];` with the
matching import.

- [ ] **Step 2: Remove the platform audit page and its dead code**

Delete the four files listed above. Then:

- `modules/platform-administration/platform-administration-navigation.ts`: remove the
  `'/platform-admin/audit'` item and the `FactCheckOutlined` import.
- `modules/platform-administration/platform-administration-service.ts`: remove `listAuditEvents`,
  `getAuditEvent`, and the `mapAuditPage`, `mapAuditDetail`, `AuditEvent`, `AuditEventDetail`,
  `AuditListQuery` imports.
- `…-service.test.ts`: delete the cases that call `getAuditEvent`/`listAuditEvents` and remove those
  names from the "validates identifiers" list.
- `…-mappers.ts` / `…-mappers.test.ts`: remove `RawAuditEvent`, `RawAuditEventDetail`,
  `mapAuditEvent`, `mapAuditPage`, `mapAuditDetail` and their tests.
- `…-queries.ts` / `…-queries.test.ts`: remove `parseAuditListQuery`, `safeParseAuditListQuery`, the
  `optionalUuid` helper if now unused, and their tests.
- `…-administration.types.ts`: remove `AuditEvent`, `AuditEventDetail`, `AuditListQuery`.
- `app/(authenticated)/platform-admin/page.tsx`: delete the third `<Grid>` card ("Audit visibility")
  so the overview shows the context card and the tenant-operations card; in `page.test.tsx`, drop
  `'/platform-admin/audit'` from the expected links.
- `app/select-context/page.tsx` and `components/context/context-selection-page.tsx`: remove
  `'/platform-admin/audit'` from `ALLOWED_DESTINATIONS` and the `ContextSelectionDestination` union.

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS. Anything still importing a removed name is dead code to delete, not to keep.

- [ ] **Step 3: Migrate `e2e/protected-routes.spec.ts`**

Replace the file's local constants and cookie setup with the helpers; the second `describe` becomes:

```ts
import { test, expect } from '@playwright/test';
import { addCookie, authenticate, SESSION_COOKIE_NAME } from './support/auth';

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

  test('renders /login even when an unvalidated stale cookie is present', async ({
    context,
    page,
  }, testInfo) => {
    await addCookie(context, testInfo, SESSION_COOKIE_NAME, 'stale-or-revoked-cookie');

    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('Protected routes with a mocked authenticated session', () => {
  test('stops /admin at shell-free context selection until context is chosen', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/select-context\?next=%2Fadmin$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });
});
```

- [ ] **Step 4: Migrate `e2e/context-selection.spec.ts`**

Replace the local helpers (`baseUrl`, `addCookie`, `authenticate`, `selectMuiOption`, constants
`SESSION_COOKIE_*`, `SCENARIO_COOKIE_NAME`) with imports from `./support/auth`, keep
`sameOriginRequest`, and apply these changes:

- `authenticate(context, testInfo, 'empty-organisations')` / `'selection-forbidden'` pass the
  scenario as the third argument (same call shape).
- The stale-context test uses `await addCookie(context, testInfo, CONTEXT_COOKIE_NAME,
'stale-context-token');` (import `CONTEXT_COOKIE_NAME`).
- In the selection test, the branch list now comes from the fake API's two assignments; keep
  `selectMuiOption(page, 'Branch', /Head Office/)` and the `branch_id` assertion. Replace the
  permission assertion `page.getByText('users.read')` with `page.getByText('user.view')`.

- [ ] **Step 5: Migrate `e2e/platform-administration.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

test.describe('Platform administration workspace', () => {
  test('preserves the requested destination through context selection and renders the live tenant directory and tenant detail', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    await page.goto('/platform-admin/tenants');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fplatform-admin%2Ftenants$/);

    // The platform operator has a single branch, so the backend auto-selects it.
    await selectMuiOption(page, 'Organisation', /Platform/);

    await expect(page).toHaveURL(/\/platform-admin\/tenants$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tenant directory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${PLATFORM_TENANT_ID}`,
    );
    await expect(page.getByRole('navigation', { name: 'pagination navigation' })).toBeVisible();

    await page.getByRole('link', { name: 'Acme SACCO' }).click();
    await expect(page).toHaveURL(new RegExp(`/platform-admin/tenants/${PLATFORM_TENANT_ID}$`));
    await expect(page.getByRole('heading', { name: 'Acme SACCO' }).first()).toBeVisible();
    await expect(page.getByText('COMPLETED')).toBeVisible();
  });

  test('keeps tenant contexts out of the platform workspace', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/platform-admin');
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    await selectMuiOption(page, 'Branch', /Head Office/);

    await expect(page).toHaveURL(/\/admin$/);
  });
});
```

- [ ] **Step 6: Update CI and run the whole E2E suite**

In `.github/workflows/ci.yml`, change the `PLATFORM_ORGANISATION_ID` line and its comment to:

```yaml
# The reserved platform organisation (backend seed). The E2E fake API uses the same id;
# Playwright also passes it to the dev server explicitly.
PLATFORM_ORGANISATION_ID: 00000000-0000-0000-0000-000000000000
```

Run: `pnpm exec prettier --write e2e .github && pnpm test:e2e`
Expected: PASS (all specs, including `login.spec.ts` unchanged).

- [ ] **Step 7: Commit**

```bash
git add -A e2e .github/workflows/ci.yml app components modules
git commit -m "$(cat <<'EOF'
test(e2e): run platform specs against the fake API and remove platform audit

The platform context cannot read audit events (tenant routes reject it and there is no platform
audit endpoint), so the page only ever worked against the in-app fake. See docs/backend-gaps.md
BG-06.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Documentation and layer verification

**Files:**

- Modify: `README.md` (Testing section; Directory structure: `e2e/fake-api/`, `e2e/support/`;
  remove the platform audit mentions in "Current limitations" and directory tree)
- Modify: `AGENTS.md` (add rules below)

- [ ] **Step 1: README — replace the End-to-end bullet in "Testing"**

```markdown
- **End-to-end**: `pnpm test:e2e`. Playwright starts two servers: the standalone fake platform API
  (`e2e/fake-api/`, plain `node` with type stripping, zero dependencies) and the Next dev server
  pointed at it. Each test calls `authenticate(context, testInfo, scenario)` from
  `e2e/support/auth.ts`, which gets an isolated, scenario-seeded fake backend. The fake mirrors the
  real API's wire behaviour (snake_case, problem+json, context tokens, permissions — see
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`). Run it alone with
  `pnpm fake-api`. Chromium is the required project; install it once with
  `pnpm exec playwright install chromium`. This suite never talks to a real Keycloak or backend.
```

- [ ] **Step 2: AGENTS.md — append to "Finaxis frontend rules"**

```markdown
- E2E tests run against the standalone fake API in `e2e/fake-api/` — never add backend fixtures to
  app code. Fake-API files run under plain `node`: relative `.mts` imports, `import type` for types,
  erasable TypeScript only (no enums, namespaces, parameter properties). Add only endpoints a layer
  uses, mirroring the contract document exactly (including backend quirks).
- The backend's wire format is snake_case and differs from the published OpenAPI casing; never
  generate a client from the OpenAPI as-is. Follow
  `docs/superpowers/specs/2026-09-25-admin-prototype-parity-api-contract.md`.
```

- [ ] **Step 3: Gates and commit**

```bash
pnpm check
pnpm build
pnpm test:e2e
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: document the fake API E2E harness and wire-contract rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: all gates pass. No live check in this layer (no new backend reads).
