# PR 05: Working Context — All Branches, Context Dialog, App Switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Make the working context match the backend's real model — organisation plus a branch _or_
"All branches" (institution level) — and let users switch it from the app bar and the two-tile app
switcher, with validated responses, de-duplicated branches, and a safe error boundary.

**Architecture:** `/auth/*` responses are validated with zod at the service boundary
(`auth/context-contract.ts`) and de-duplicated. `ApplicationContext.branch` becomes nullable.
`getCurrentContextProfile()` (React `cache`) removes duplicate `/auth/me` calls per request. The
organisation/branch selection logic is extracted from the `/select-context` page into a hook + form
shared by the page and a header dialog. Non-auth failures reaching the layout throw to `app/error.tsx`
instead of looping through context selection.

**Tech Stack:** Next.js 16 (React `cache`, `error.tsx` with `retry`), zod 4, MUI 9 (`Dialog`,
`Popover`, `Snackbar`), Vitest + RTL, Playwright.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §6.3 (dedupe), §6.5
(context model), §6.7 (errors), §8 (context dialog, app switcher), D4, D5; contract §C
(`AvailableOrganisation`, `AvailableBranch`, `SelectOrganisationResponse`, `UserProfile`), §E.4.

## Global Constraints

See the index. Additionally:

- The selection flow keeps its current DOM contract on `/select-context` (comboboxes named
  "Organisation" and "Branch", alerts, pagination navs) so existing tests keep passing; changes are
  additive (All branches option, auto-pinning, validation).
- `PLATFORM_ORGANISATION_ID` reaches the client only as a plain string prop (non-secret).
- **Live read check (first in the stack):** after Task 6, the user signs in on the local app pointed
  at dev; verify `/auth/organisations`, `select-organisation`, `/auth/branches`, `select-branch`,
  `/auth/me` for a single-branch user, a multi-branch user (including All branches), and the platform
  organisation. Record any contract surprise in the contract document.

## Review Focus

Pins index items 1 (stale context → reselection; Task 1), 3 (branch cardinality; Task 2), and 5
(schema drift → error boundary with reference; Task 1).

---

### Task 1: Validated `/auth` contract, problem-aware errors, nullable branch, cached profile

**Files:**

- Modify: `auth/backend-api.ts` (problem parsing), `auth/backend-api.test.ts` (new cases)
- Create: `auth/context-contract.ts`, `auth/context-contract.test.ts`
- Modify: `auth/context-service.ts`, `auth/context-service.test.ts`
- Modify: `config/application-context.ts` (nullable branch; delete the unused `applicationContext`
  fixture)
- Create: `app/error.tsx`
- Modify callers to `getCurrentContextProfile()`: `app/(authenticated)/layout.tsx`,
  `app/(authenticated)/platform-admin/layout.tsx`, `app/(authenticated)/platform-admin/page.tsx`,
  `app/(authenticated)/profile/page.tsx`, and their tests' `@/auth/context-service` mocks
- Modify: `components/shell/global-header.tsx`, `components/shell/app-shell.tsx`,
  `app/(authenticated)/platform-admin/page.tsx` (render `branch?.name ?? 'All branches'`)

**Interfaces:**

- Produces:
  - `BackendApiError` gains `readonly code: string | null` and `readonly requestId: string | null`
    (safe fields parsed from problem+json; `status` unchanged).
  - `organisationPageSchema`, `branchPageSchema` (items de-duplicated by `branch_id`),
    `selectOrganisationResponseSchema` (`assigned_branch_ids` de-duplicated),
    `selectBranchResponseSchema`, `profileSchema` (`branches`/`roles` de-duplicated by `id`) — all
    output the existing snake_case types in `auth/context.types.ts`.
  - `SelectedContextProfile` reasons: `'missing-context-token' | 'invalid-context'`; non-auth
    failures (5xx, network, schema) now throw.
  - `getCurrentContextProfile(): Promise<SelectedContextProfile>` — `cache()`d, reads `headers()`.
  - `ApplicationContext.branch: ApplicationContextBranch | null` (`null` = All branches).

- [ ] **Step 1: Write failing backend-api problem tests**

Append to `auth/backend-api.test.ts` (reuse its existing `fetch`/token mocks and helpers):

```ts
it('exposes the safe problem code and request id from problem+json errors', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        type: 'urn:finaxis:problem:invalid_active_tenant_context',
        title: 'Forbidden',
        status: 403,
        detail: 'The active organisation context is invalid.',
        instance: '/api/v1/auth/me',
        code: 'invalid_active_tenant_context',
        request_id: 'req-123',
        violations: null,
      }),
      { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  );

  const error = await backendApi.get('/api/v1/auth/me', new Headers()).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(BackendApiError);
  expect(error).toMatchObject({
    status: 403,
    code: 'invalid_active_tenant_context',
    requestId: 'req-123',
  });
});

it('tolerates an empty error body (invalid JWT) and non-JSON errors', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }));

  const error = await backendApi.get('/api/v1/auth/me', new Headers()).catch((e: unknown) => e);

  expect(error).toMatchObject({ status: 401, code: null, requestId: null });
});
```

(If the existing test file stubs `fetch` differently, adapt the two `mockResolvedValueOnce` calls to
its helper; keep the assertions.) Run `pnpm test:run auth/backend-api.test.ts` → the two new tests
FAIL (`code` undefined).

- [ ] **Step 2: Parse problem responses in `auth/backend-api.ts`**

Replace the `BackendApiError` class and the `if (!response.ok)` branch:

```ts
export class BackendApiError extends Error {
  readonly problem: SafeBackendProblem;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    readonly status: number,
    details: { code?: string | null; requestId?: string | null } = {},
  ) {
    super(`Platform API request failed with status ${status}.`);
    this.name = 'BackendApiError';
    this.problem = { status, title: 'Platform API request failed.' };
    this.code = details.code ?? null;
    this.requestId = details.requestId ?? null;
  }
}

/** Reads only the safe, stable fields of a problem+json body; anything else is ignored. */
async function problemDetails(
  response: Response,
): Promise<{ code: string | null; requestId: string | null }> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) {
      return { code: null, requestId: null };
    }
    const code = 'code' in body && typeof body.code === 'string' ? body.code : null;
    const requestId =
      'request_id' in body && typeof body.request_id === 'string' ? body.request_id : null;
    return { code, requestId };
  } catch {
    return { code: null, requestId: response.headers.get('x-request-id') };
  }
}
```

and inside `request()`:

```ts
if (!response.ok) {
  throw new BackendApiError(response.status, await problemDetails(response));
}
```

Run `pnpm test:run auth/backend-api.test.ts` → PASS.

- [ ] **Step 3: Write failing contract tests**

`auth/context-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  branchPageSchema,
  profileSchema,
  selectOrganisationResponseSchema,
} from './context-contract';

const page = {
  number: 0,
  size: 25,
  total_items: 2,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

const profile = {
  user_id: 'u-1',
  keycloak_subject: 'kc-1',
  email: 'jane@example.test',
  full_name: 'Jane',
  organisation: { id: 'o-1', code: 'umoja', name: 'Umoja SACCO', status: 'ACTIVE' },
  membership: { id: 'm-1', status: 'ACTIVE' },
  selected_branch: null,
  branches: [
    { id: 'b-1', code: 'HQ', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-1', code: 'HQ', name: 'Head Office', status: 'ACTIVE' },
  ],
  roles: [
    { id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' },
    { id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' },
  ],
  permissions: ['user.view'],
};

describe('auth context contract', () => {
  it('de-duplicates branches and roles in the profile (one row per assignment upstream)', () => {
    const parsed = profileSchema.parse(profile);
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.roles).toHaveLength(1);
    expect(parsed.selected_branch).toBeNull();
  });

  it('ignores unknown extra fields', () => {
    expect(() => profileSchema.parse({ ...profile, future_field: 1 })).not.toThrow();
  });

  it('rejects a profile missing a required field', () => {
    const { user_id: _omit, ...withoutId } = profile;
    expect(profileSchema.safeParse(withoutId).success).toBe(false);
  });

  it('de-duplicates assigned branch ids and branch page rows', () => {
    const selection = selectOrganisationResponseSchema.parse({
      organisation_id: 'o-1',
      membership_id: 'm-1',
      context_token: 'token',
      context_header: 'X-Active-Organisation-Context',
      branch_id: null,
      requires_branch_selection: true,
      assigned_branch_ids: ['b-1', 'b-1'],
    });
    expect(selection.assigned_branch_ids).toEqual(['b-1']);

    const branches = branchPageSchema.parse({
      items: [
        {
          branch_id: 'b-1',
          branch_code: 'HQ',
          branch_name: 'Head Office',
          branch_status: 'ACTIVE',
        },
        {
          branch_id: 'b-1',
          branch_code: 'HQ',
          branch_name: 'Head Office',
          branch_status: 'ACTIVE',
        },
      ],
      page,
    });
    expect(branches.items).toHaveLength(1);
  });
});
```

Run `pnpm test:run auth/context-contract.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement `auth/context-contract.ts`**

```ts
import { z } from 'zod';
import type {
  BackendBranch,
  BackendOrganisation,
  BackendProfile,
  Page,
  SelectBranchResponse,
  SelectOrganisationResponse,
} from '@/auth/context.types';

/**
 * Runtime validation for the `/api/v1/auth/*` wire shapes (contract §C). Outputs keep the
 * snake_case server-only types in auth/context.types.ts. The backend returns one row per
 * assignment, so branches/roles/assigned ids are de-duplicated here.
 */
function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

const pageMetadata = z.object({
  number: z.number().int(),
  size: z.number().int(),
  total_items: z.number().int(),
  total_pages: z.number().int(),
  has_next: z.boolean(),
  has_previous: z.boolean(),
});

const organisation = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  tenant_code: z.string(),
  display_name: z.string(),
  organisation_status: z.string(),
  membership_status: z.string(),
});

const branch = z.object({
  branch_id: z.string(),
  branch_code: z.string(),
  branch_name: z.string(),
  branch_status: z.string(),
});

const profileBranch = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
});
const profileRole = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
});

export const organisationPageSchema: z.ZodType<Page<BackendOrganisation>> = z.object({
  items: z.array(organisation),
  page: pageMetadata,
});

export const branchPageSchema: z.ZodType<Page<BackendBranch>> = z.object({
  items: z.array(branch).transform((items) => uniqueBy(items, (item) => item.branch_id)),
  page: pageMetadata,
});

export const selectOrganisationResponseSchema: z.ZodType<SelectOrganisationResponse> = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  context_token: z.string(),
  context_header: z.string(),
  branch_id: z.string().nullable(),
  requires_branch_selection: z.boolean(),
  assigned_branch_ids: z.array(z.string()).transform((ids) => [...new Set(ids)]),
});

export const selectBranchResponseSchema: z.ZodType<SelectBranchResponse> = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  branch_id: z.string(),
  context_token: z.string(),
  context_header: z.string(),
});

export const profileSchema: z.ZodType<BackendProfile> = z.object({
  user_id: z.string(),
  keycloak_subject: z.string(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
  organisation: profileBranch.nullable(),
  membership: z.object({ id: z.string(), status: z.string() }),
  selected_branch: profileBranch.nullable(),
  branches: z.array(profileBranch).transform((items) => uniqueBy(items, (item) => item.id)),
  roles: z.array(profileRole).transform((items) => uniqueBy(items, (item) => item.id)),
  permissions: z.array(z.string()),
});
```

(`organisation` reuses the `{id, code, name, status}` shape.) Run the contract test → PASS.

- [ ] **Step 5: Write failing context-service tests**

In `auth/context-service.test.ts`, add (reusing the file's `backendApi` mock setup):

```ts
it('resolves an institution-level context when no branch is selected', async () => {
  readContextToken.mockResolvedValueOnce('org-token');
  backendApiGet.mockResolvedValueOnce({ ...PROFILE, selected_branch: null });

  const result = await getSelectedContextProfile(new Headers());

  expect(result).toMatchObject({ kind: 'resolved', context: { branch: null } });
});

it('sends a stale or revoked context back to context selection', async () => {
  readContextToken.mockResolvedValueOnce('stale-token');
  backendApiGet.mockRejectedValueOnce(
    new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
  );

  await expect(getSelectedContextProfile(new Headers())).resolves.toEqual({
    kind: 'redirect-to-context-selection',
    reason: 'invalid-context',
  });
});

it('throws on backend outages and schema drift instead of looping through selection', async () => {
  readContextToken.mockResolvedValue('token');
  backendApiGet.mockRejectedValueOnce(new BackendApiError(502));
  await expect(getSelectedContextProfile(new Headers())).rejects.toBeInstanceOf(BackendApiError);

  backendApiGet.mockResolvedValueOnce({ ...PROFILE, user_id: undefined });
  await expect(getSelectedContextProfile(new Headers())).rejects.toThrow();
});
```

(`PROFILE` is the file's existing profile fixture; `readContextToken`/`backendApiGet` are its existing
mocks — rename to match.) Run → FAIL.

- [ ] **Step 6: Update `auth/context-service.ts`**

1. Import `cache` from `react`, `headers` from `next/headers`, `BackendApiError` from
   `@/auth/backend-api`, and the schemas from `@/auth/context-contract`.
2. Parse every response: `organisationPageSchema.parse(await backendApi.get<unknown>(…))` in
   `discoverOrganisations`; `branchPageSchema.parse` in `discoverBranches`;
   `selectOrganisationResponseSchema.parse` / `selectBranchResponseSchema.parse` in the two
   selection functions.
3. Replace the `SelectedContextProfile` type and `getSelectedContextProfile`:

```ts
export type SelectedContextProfile =
  | {
      kind: 'resolved';
      profile: BackendProfile;
      context: ApplicationContext;
    }
  | {
      kind: 'redirect-to-context-selection';
      reason: 'missing-context-token' | 'invalid-context';
    };

function isAuthFailure(error: unknown): boolean {
  return error instanceof BackendApiError && (error.status === 401 || error.status === 403);
}

/**
 * Resolves the only context that is safe to pass to the authenticated shell. The signed context
 * token stays in the HttpOnly cookie. 401/403 (expired session, stale or revoked context) send the
 * user back through context selection; any other failure — backend outage or a response that no
 * longer matches the contract — throws to the error boundary rather than looping.
 */
export async function getSelectedContextProfile(headers: Headers): Promise<SelectedContextProfile> {
  const contextToken = await readContextToken(headers);
  if (!contextToken) {
    return { kind: 'redirect-to-context-selection', reason: 'missing-context-token' };
  }

  let raw: unknown;
  try {
    raw = await backendApi.get<unknown>('/api/v1/auth/me', headers, contextToken);
  } catch (error) {
    if (isAuthFailure(error)) {
      return { kind: 'redirect-to-context-selection', reason: 'invalid-context' };
    }
    throw error;
  }

  const profile = profileSchema.parse(raw);
  if (!profile.organisation) {
    return { kind: 'redirect-to-context-selection', reason: 'invalid-context' };
  }

  return {
    kind: 'resolved',
    profile,
    context: {
      module: resolveApplicationContextModule(profile.organisation.id),
      organization: { id: profile.organisation.id, name: profile.organisation.name },
      branch: profile.selected_branch
        ? { id: profile.selected_branch.id, name: profile.selected_branch.name }
        : null,
    },
  };
}

/** Per-request memoized profile for Server Components (one `/auth/me` call per render). */
export const getCurrentContextProfile = cache(async (): Promise<SelectedContextProfile> =>
  getSelectedContextProfile(await headers()),
);
```

4. In `config/application-context.ts`: change `branch: ApplicationContextBranch;` to
   `/** `null` = All branches (organisation selected, no branch — institution level). */ branch:
ApplicationContextBranch | null;`, and delete the `applicationContext` fixture and its comment.

Update the existing context-service tests that expected `'profile-request-failed'` or
`'profile-has-no-selected-branch'`: the former becomes `'invalid-context'` for 401/403 and a thrown
error otherwise; the latter now resolves with `branch: null`. Run `pnpm test:run auth/` → PASS.

- [ ] **Step 7: Switch Server Components to the cached profile and render All branches**

- `app/(authenticated)/layout.tsx`, `…/platform-admin/layout.tsx`, `…/platform-admin/page.tsx`,
  `…/profile/page.tsx`: call `await getCurrentContextProfile()` instead of
  `getSelectedContextProfile(requestHeaders)` (keep `headers()` only where still needed, e.g. the
  redirect path and service calls). In each test, mock `getCurrentContextProfile` in the
  `@/auth/context-service` mock factory the same way `getSelectedContextProfile` was mocked.
- `components/shell/global-header.tsx`: render `{branch?.name ?? 'All branches'}` and use the same
  in the aria-label.
- `components/shell/app-shell.tsx`: `footerSubtitle={context.branch?.name ?? 'All branches'}`.
- `app/(authenticated)/platform-admin/page.tsx`: `{selectedContext.context.branch?.name ?? 'All branches'}`.

Add to `components/shell/global-header.test.tsx`:

```tsx
it('shows All branches for an institution-level context', () => {
  renderWithProviders(
    <ApplicationContextProvider value={{ ...CONTEXT, branch: null }}>
      <GlobalHeader user={USER} onOpenNavigation={vi.fn()} />
    </ApplicationContextProvider>,
  );

  expect(screen.getByText('All branches')).toBeInTheDocument();
});
```

- [ ] **Step 8: Add the error boundary `app/error.tsx`**

```tsx
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Catches errors thrown below the root layout — including the authenticated layout — such as a
 * backend outage or a response that no longer matches the contract. Shows only the digest as a
 * support reference; server error messages are never rendered.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Box
      component="main"
      className="flex min-h-dvh items-center justify-center p-4"
      sx={{ bgcolor: 'background.default' }}
    >
      <Paper sx={{ maxWidth: 520, width: '100%', p: { xs: 6, sm: 8 } }}>
        <Stack spacing={3}>
          <Typography component="h1" variant="h3">
            Something went wrong
          </Typography>
          <Typography color="text.secondary">
            We couldn&apos;t load this page. Try again, or sign in again if the problem continues.
          </Typography>
          {error.digest && (
            <Typography variant="caption" color="text.secondary">
              Reference: {error.digest}
            </Typography>
          )}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={retry}>
              Try again
            </Button>
            <Button variant="outlined" href="/login">
              Back to sign in
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 9: Run gates and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add -A auth config app components
git commit -m "$(cat <<'EOF'
feat(context): validate auth responses, support institution-level context, cache the profile

Non-auth failures resolving the context now reach an error boundary instead of looping through
context selection.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Shared selection logic with All branches and auto-pinning

**Files:**

- Create: `components/context/context-api.ts` (client fetch helpers + response guards moved out of
  the page)
- Create: `components/context/use-context-selection.ts`, `use-context-selection.test.ts`
- Create: `components/context/context-selection-form.tsx`
- Modify: `components/context/context-selection-page.tsx` (becomes a thin page shell)
- Modify: `auth/context-browser-dto.ts` (`assignedBranchIds` already de-duplicated by the contract;
  no change needed beyond confirming)

**Interfaces:**

- Produces:
  - `context-api.ts`: `ContextRequestError`, `fetchOrganisations(page)`, `selectOrganisationRequest(
organisationId)`, `fetchBranches(page)`, `selectBranchRequest(branchId)` (all hitting the existing
    `/api/context/*` routes), `isBrowserPage`, `isBrowserOrganisation`, `isBrowserBranch`.
  - `type SelectionOutcome = { kind: 'branch'; organisationId: string; branchId: string } | { kind:
'institution'; organisationId: string }`.
  - `nextStepAfterOrganisation(selection): 'done-branch' | 'done-institution' | { autoSelect: string }
| 'choose-branch'` (pure; exported for tests).
  - `useContextSelection({ initialOrganisations, hasOrganisationLoadError, onComplete,
onOrganisationCommitted?, onSessionExpired })`.
  - `ALL_BRANCHES_VALUE = '__all__'`; `ContextSelectionForm({ initialOrganisations,
hasOrganisationLoadError?, onComplete, onOrganisationCommitted? })`.

- [ ] **Step 1: Write the failing decision test (Review Focus 3)**

`components/context/use-context-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextStepAfterOrganisation } from './use-context-selection';

describe('nextStepAfterOrganisation', () => {
  it('finishes when the backend auto-selected the only branch', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: false,
        branchId: 'b-1',
        assignedBranchIds: ['b-1'],
      }),
    ).toBe('done-branch');
  });

  it('finishes at institution level for members with no branches', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: false,
        branchId: null,
        assignedBranchIds: [],
      }),
    ).toBe('done-institution');
  });

  it('auto-selects the single distinct branch when duplicate rows made the backend ask', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: true,
        branchId: null,
        assignedBranchIds: ['b-1'],
      }),
    ).toEqual({ autoSelect: 'b-1' });
  });

  it('asks for a branch (offering All branches) when several distinct branches exist', () => {
    expect(
      nextStepAfterOrganisation({
        requiresBranchSelection: true,
        branchId: null,
        assignedBranchIds: ['b-1', 'b-2'],
      }),
    ).toBe('choose-branch');
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Move fetch helpers and guards into `components/context/context-api.ts`**

Cut `isRecord`, `isOrganisationSelectionResponse`, `isBrowserBranch`, `isBrowserPageMetadata`,
`isBrowserOrganisation`, `isBrowserPage`, `ContextRequestError`, and `readSuccessfulJson` out of
`context-selection-page.tsx` into this module (export them), then add:

```ts
export interface OrganisationSelectionResponse {
  branchId: string | null;
  requiresBranchSelection: boolean;
  /** De-duplicated server-side; older fixtures may omit it. */
  assignedBranchIds: readonly string[];
}

export async function fetchOrganisations(page: number): Promise<BrowserPage<BrowserOrganisation>> {
  const body = await readSuccessfulJson(await fetch(`/api/context/organisations?page=${page}`));
  if (!isBrowserPage(body, isBrowserOrganisation)) {
    throw new Error('Invalid organisation response.');
  }
  return body;
}

export async function fetchBranches(page: number): Promise<BrowserPage<BrowserBranch>> {
  const body = await readSuccessfulJson(await fetch(`/api/context/branches?page=${page}`));
  if (!isBrowserPage(body, isBrowserBranch)) {
    throw new Error('Invalid branch response.');
  }
  return body;
}

export async function selectOrganisationRequest(
  organisationId: string,
): Promise<OrganisationSelectionResponse> {
  const body = await readSuccessfulJson(
    await fetch('/api/context/organisation', {
      body: JSON.stringify({ organisation_id: organisationId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }),
  );
  if (!isOrganisationSelectionResponse(body)) {
    throw new Error('Invalid organisation selection response.');
  }
  const assigned =
    isRecord(body) && Array.isArray(body.assignedBranchIds) ? body.assignedBranchIds : [];
  return {
    branchId: body.branchId,
    requiresBranchSelection: body.requiresBranchSelection,
    assignedBranchIds: assigned.filter((id): id is string => typeof id === 'string'),
  };
}

export async function selectBranchRequest(branchId: string): Promise<void> {
  await readSuccessfulJson(
    await fetch('/api/context/branch', {
      body: JSON.stringify({ branch_id: branchId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }),
  );
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 401;
}

export function isStaleContext(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 409;
}
```

- [ ] **Step 3: Implement `components/context/use-context-selection.ts`**

```ts
'use client';

import { useState } from 'react';
import type { BrowserBranch, BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import {
  fetchBranches,
  fetchOrganisations,
  isSessionExpired,
  isStaleContext,
  selectBranchRequest,
  selectOrganisationRequest,
  type OrganisationSelectionResponse,
} from './context-api';

export const CONTEXT_UPDATE_ERROR = "We couldn't update your context. Please try again.";
export const BRANCH_DISCOVERY_ERROR = "We couldn't load branches. Please try again.";
export const ORGANISATION_DISCOVERY_ERROR = "We couldn't load organisations. Please try again.";
export const STALE_CONTEXT_MESSAGE =
  'Your saved context is no longer valid. Select an organisation again.';

export type SelectionOutcome =
  | { kind: 'branch'; organisationId: string; branchId: string }
  | { kind: 'institution'; organisationId: string };

type NextStep = 'done-branch' | 'done-institution' | { autoSelect: string } | 'choose-branch';

/**
 * What to do after the organisation is committed (contract §C `SelectOrganisationResponse`): the
 * backend auto-selects a lone assignment row; duplicate rows for one branch make it ask anyway, so
 * a single distinct branch is pinned here; several distinct branches offer All branches.
 */
export function nextStepAfterOrganisation(selection: OrganisationSelectionResponse): NextStep {
  if (!selection.requiresBranchSelection) {
    return selection.branchId ? 'done-branch' : 'done-institution';
  }
  const distinct = [...new Set(selection.assignedBranchIds)];
  const [only] = distinct;
  return distinct.length === 1 && only !== undefined ? { autoSelect: only } : 'choose-branch';
}

interface UseContextSelectionOptions {
  initialOrganisations: BrowserPage<BrowserOrganisation>;
  hasOrganisationLoadError?: boolean;
  onComplete: (outcome: SelectionOutcome) => void;
  /** Called once the organisation is committed and a branch choice is still pending. */
  onOrganisationCommitted?: (organisationId: string) => void;
  onSessionExpired: () => void;
}

export function useContextSelection({
  initialOrganisations,
  hasOrganisationLoadError = false,
  onComplete,
  onOrganisationCommitted,
  onSessionExpired,
}: UseContextSelectionOptions) {
  const [organisationPage, setOrganisationPage] = useState(initialOrganisations);
  const [organisationId, setOrganisationId] = useState('');
  const [branchPage, setBranchPage] = useState<BrowserPage<BrowserBranch> | null>(null);
  const [lastOrganisationPageRequest, setLastOrganisationPageRequest] = useState(
    initialOrganisations.page.number,
  );
  const [lastBranchPageRequest, setLastBranchPageRequest] = useState(0);
  const [isLoadingOrganisations, setIsLoadingOrganisations] = useState(false);
  const [isSavingOrganisation, setIsSavingOrganisation] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [organisationError, setOrganisationError] = useState(hasOrganisationLoadError);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const isMutating = isSavingOrganisation || isSavingBranch;
  const isDiscoveryLoading = isLoadingOrganisations || isLoadingBranches;

  const loadOrganisations = async (page: number) => {
    setLastOrganisationPageRequest(page);
    setIsLoadingOrganisations(true);
    setOrganisationError(false);
    setOrganisationId('');
    setBranchPage(null);
    setUpdateError(null);
    setBranchError(null);
    try {
      setOrganisationPage(await fetchOrganisations(page));
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      setOrganisationError(true);
    } finally {
      setIsLoadingOrganisations(false);
    }
  };

  const loadBranches = async (page = 0) => {
    setLastBranchPageRequest(page);
    setIsLoadingBranches(true);
    setBranchError(null);
    try {
      setBranchPage(await fetchBranches(page));
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      setBranchPage(null);
      if (isStaleContext(error)) {
        setOrganisationId('');
        setUpdateError(STALE_CONTEXT_MESSAGE);
        return;
      }
      setBranchError(BRANCH_DISCOVERY_ERROR);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const selectBranch = async (branchId: string, forOrganisationId = organisationId) => {
    if (!branchId || isSavingBranch) {
      return;
    }
    setUpdateError(null);
    setIsSavingBranch(true);
    try {
      await selectBranchRequest(branchId);
      onComplete({ kind: 'branch', organisationId: forOrganisationId, branchId });
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      if (isStaleContext(error)) {
        setBranchPage(null);
        setOrganisationId('');
        setUpdateError(STALE_CONTEXT_MESSAGE);
        return;
      }
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingBranch(false);
    }
  };

  const selectOrganisation = async (nextOrganisationId: string) => {
    if (!nextOrganisationId || isMutating) {
      return;
    }
    setOrganisationId(nextOrganisationId);
    setBranchPage(null);
    setUpdateError(null);
    setBranchError(null);
    setIsSavingOrganisation(true);
    try {
      const selection = await selectOrganisationRequest(nextOrganisationId);
      const step = nextStepAfterOrganisation(selection);
      setIsSavingOrganisation(false);
      if (step === 'done-branch' && selection.branchId) {
        onComplete({
          kind: 'branch',
          organisationId: nextOrganisationId,
          branchId: selection.branchId,
        });
        return;
      }
      if (step === 'done-institution') {
        onComplete({ kind: 'institution', organisationId: nextOrganisationId });
        return;
      }
      if (typeof step === 'object') {
        await selectBranch(step.autoSelect, nextOrganisationId);
        return;
      }
      onOrganisationCommitted?.(nextOrganisationId);
      await loadBranches(0);
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingOrganisation(false);
    }
  };

  const selectAllBranches = () => {
    onComplete({ kind: 'institution', organisationId });
  };

  return {
    organisationPage,
    organisationId,
    branchPage,
    lastOrganisationPageRequest,
    lastBranchPageRequest,
    isLoadingOrganisations,
    isSavingOrganisation,
    isLoadingBranches,
    isSavingBranch,
    isMutating,
    isDiscoveryLoading,
    organisationError,
    updateError,
    branchError,
    loadOrganisations,
    loadBranches,
    selectOrganisation,
    selectBranch,
    selectAllBranches,
  };
}
```

Run the decision test → PASS.

- [ ] **Step 4: Implement `components/context/context-selection-form.tsx`**

Move `PaginationControls` (current lines 135–182 of `context-selection-page.tsx`) unchanged into
`components/context/pagination-controls.tsx` and export it. Then create the form. Its body is the
current page's JSX from `{organisationError && (` through the `isSavingBranch` status block (current
lines 363–506), wrapped in a fragment, with these identifier replacements and the branch `Select`
shown in full below:

| Current page identifier                                                                                                     | Form identifier                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `organisationError`, `organisationPage`, `organisationId`, `branchPage`                                                     | `selection.organisationError`, `selection.organisationPage`, `selection.organisationId`, `selection.branchPage` |
| `isMutating`, `isDiscoveryLoading`, `isLoadingOrganisations`, `isSavingOrganisation`, `isLoadingBranches`, `isSavingBranch` | `selection.<same name>`                                                                                         |
| `updateError`, `branchError`, `lastOrganisationPageRequest`, `lastBranchPageRequest`                                        | `selection.<same name>`                                                                                         |
| `loadOrganisations(…)`, `loadBranches(…)`, `selectOrganisation(…)`                                                          | `selection.loadOrganisations(…)`, `selection.loadBranches(…)`, `selection.selectOrganisation(…)`                |
| `hasNoOrganisations`, `canChooseOrganisation`, `hasLoadedBranches`, `hasNoBranches`                                         | computed in the form exactly as the page computes them (current lines 337–340), from `selection.*`              |

```tsx
'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { PaginationControls } from './pagination-controls';
import {
  ORGANISATION_DISCOVERY_ERROR,
  useContextSelection,
  type SelectionOutcome,
} from './use-context-selection';

export const ALL_BRANCHES_VALUE = '__all__';

interface ContextSelectionFormProps {
  initialOrganisations: BrowserPage<BrowserOrganisation>;
  hasOrganisationLoadError?: boolean;
  onComplete: (outcome: SelectionOutcome) => void;
  onOrganisationCommitted?: (organisationId: string) => void;
  onSessionExpired: () => void;
}

export function ContextSelectionForm(props: ContextSelectionFormProps) {
  const selection = useContextSelection(props);
  const hasNoOrganisations = selection.organisationPage.items.length === 0;
  const canChooseOrganisation = !selection.organisationError && !hasNoOrganisations;
  const hasLoadedBranches = selection.branchPage !== null;
  const hasNoBranches = hasLoadedBranches && selection.branchPage.items.length === 0;

  return (
    <>
      {/* current lines 363–471 with the replacements above */}
      {hasLoadedBranches && !hasNoBranches && (
        <FormControl fullWidth disabled={selection.isMutating || selection.isDiscoveryLoading}>
          <InputLabel id="branch-label">Branch</InputLabel>
          <Select
            label="Branch"
            labelId="branch-label"
            onChange={(event) => {
              if (event.target.value === ALL_BRANCHES_VALUE) {
                selection.selectAllBranches();
                return;
              }
              void selection.selectBranch(event.target.value);
            }}
            value=""
          >
            <MenuItem value={ALL_BRANCHES_VALUE}>All branches (institution level)</MenuItem>
            {selection.branchPage.items.map((branch) => (
              <MenuItem key={branch.branchId} value={branch.branchId}>
                {branch.branchName} ({branch.branchCode})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {/* current lines 492–506 with the replacements above */}
    </>
  );
}
```

The two comments mark where the moved JSX goes; they are not left in the file. Keep every string,
role, and label identical (the page tests assert them). `ORGANISATION_DISCOVERY_ERROR` is used by the
moved organisation error alert.

- [ ] **Step 5: Reduce `components/context/context-selection-page.tsx` to the page shell**

```tsx
'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { ContextSelectionForm } from './context-selection-form';

const SESSION_EXPIRED_REDIRECT = '/login?reason=session_expired';

interface ContextSelectionPageProps {
  organisations: BrowserPage<BrowserOrganisation>;
  /** Already validated server-side by `safeContextDestination`. */
  destination: string;
  hasOrganisationLoadError?: boolean;
}

export function ContextSelectionPage({
  destination,
  organisations,
  hasOrganisationLoadError = false,
}: ContextSelectionPageProps) {
  const router = useRouter();

  return (
    <Box
      component="main"
      className="flex min-h-dvh items-center justify-center p-4"
      sx={{ bgcolor: 'background.default' }}
    >
      <Paper
        component="section"
        variant="outlined"
        sx={{ maxWidth: 560, p: { xs: 3, sm: 4 }, width: '100%' }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Select your context
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Choose the organisation and branch you want to work in.
            </Typography>
          </Box>
          <ContextSelectionForm
            initialOrganisations={organisations}
            hasOrganisationLoadError={hasOrganisationLoadError}
            onComplete={() => {
              router.replace(destination);
            }}
            onSessionExpired={() => {
              router.replace(SESSION_EXPIRED_REDIRECT);
            }}
          />
        </Stack>
      </Paper>
    </Box>
  );
}
```

`destination` becomes required here; `app/select-context/page.tsx` supplies it (Task 5). Run
`pnpm test:run components/context` — existing page tests must still pass; add one test to
`context-selection-page.test.tsx` in its existing fetch-mock style: organisation selection responds
`{ requiresBranchSelection: true, branchId: null, assignedBranchIds: [BRANCH_A, BRANCH_B] }`, the branch
list loads, the "Branch" combobox offers "All branches (institution level)", choosing it calls
`router.replace(destination)` without any `POST /api/context/branch`; and one where
`assignedBranchIds: [BRANCH_A]` with `requiresBranchSelection: true` posts `/api/context/branch` for
`BRANCH_A` without showing the combobox.

- [ ] **Step 6: Commit**

```bash
git add -A components/context
git commit -m "$(cat <<'EOF'
feat(context): share selection logic; offer All branches and pin a lone distinct branch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Toasts and the header context dialog

**Files:**

- Create: `components/providers/toast-provider.tsx`, `toast-provider.test.tsx`
- Create: `components/shell/context-switcher-dialog.tsx`, `context-switcher-dialog.test.tsx`
- Modify: `components/shell/app-shell.tsx` (mount `ToastProvider`; own dialog state; accept
  `platformOrganisationId`), `components/shell/global-header.tsx` (context button opens the dialog),
  `global-header.test.tsx`
- Modify: `app/(authenticated)/layout.tsx` (pass `platformOrganisationId={serverEnv.PLATFORM_ORGANISATION_ID}`),
  its test
- Create: `app/(authenticated)/admin/layout.tsx`, `…/admin/layout.test.tsx` (platform contexts are
  redirected to `/platform-admin`)

**Interfaces:**

- Produces:
  - `ToastProvider({ children })`, `useToast(): (message: string, severity?: AlertColor) => void`.
  - `ContextSwitcherDialog({ open, onClose, platformOrganisationId })` — loads organisations when
    opened; completes by navigating to the workspace home when the organisation changed, otherwise
    `router.refresh()`; closing after the organisation was committed but before a branch choice
    lands at All branches with a toast.
  - `AppShell` props gain `platformOrganisationId: string`; `GlobalHeader` props gain
    `onOpenContextSwitcher: () => void`.

- [ ] **Step 1: Write the failing toast test**

`components/providers/toast-provider.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ToastProvider, useToast } from './toast-provider';

function Trigger() {
  const notify = useToast();
  return (
    <button type="button" onClick={() => notify('Context switched to Head Office')}>
      Notify
    </button>
  );
}

describe('ToastProvider', () => {
  it('shows a status message and dismisses it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(await screen.findByText('Context switched to Head Office')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Context switched to Head Office')).not.toBeInTheDocument();
  });

  it('requires a provider', () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => renderWithProviders(<Orphan />)).toThrow(/ToastProvider/);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `components/providers/toast-provider.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import type { AlertColor } from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

type Notify = (message: string, severity?: AlertColor) => void;

const ToastContext = createContext<Notify | null>(null);

interface Toast {
  id: number;
  message: string;
  severity: AlertColor;
}

/** One transient outcome message at a time (prototype `.toast`), announced politely. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback<Notify>((message, severity = 'success') => {
    setToast({ id: Date.now(), message, severity });
  }, []);
  const close = () => {
    setToast(null);
  };

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.id}
        open={toast !== null}
        autoHideDuration={5000}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') close();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={close} role="status">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return notify;
}
```

Run → PASS.

- [ ] **Step 3: Write the failing dialog test**

`components/shell/context-switcher-dialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ToastProvider } from '@/components/providers/toast-provider';
import { ApplicationContextProvider } from './organization-context';
import { ContextSwitcherDialog } from './context-switcher-dialog';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => ({ push, refresh, replace: vi.fn() }) };
});

const PAGE = {
  number: 0,
  size: 25,
  totalItems: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
const ORG = {
  organisationId: 'org-2',
  membershipId: 'm-2',
  tenantCode: 'imara',
  displayName: 'Imara SACCO',
  organisationStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
};

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function renderDialog(onClose = vi.fn()) {
  renderWithProviders(
    <ToastProvider>
      <ApplicationContextProvider
        value={{
          module: { id: 'administration', name: 'Administration' },
          organization: { id: 'org-1', name: 'Umoja SACCO' },
          branch: { id: 'b-1', name: 'Head Office' },
        }}
      >
        <ContextSwitcherDialog open onClose={onClose} platformOrganisationId="platform" />
      </ApplicationContextProvider>
    </ToastProvider>,
  );
  return onClose;
}

describe('ContextSwitcherDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();
  });

  it('switches to a single-branch organisation and goes to its workspace', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: 'b-9', requiresBranchSelection: false, assignedBranchIds: ['b-9'] }),
      );
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));

    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/admin');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('lands at All branches when closed after the organisation was committed', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => json({ items: [ORG], page: PAGE }))
      .mockImplementationOnce(() =>
        json({ branchId: null, requiresBranchSelection: true, assignedBranchIds: ['b-1', 'b-2'] }),
      )
      .mockImplementationOnce(() =>
        json({
          items: [
            {
              branchId: 'b-1',
              branchCode: 'HQ',
              branchName: 'Head Office',
              branchStatus: 'ACTIVE',
            },
            { branchId: 'b-2', branchCode: 'WST', branchName: 'Westlands', branchStatus: 'ACTIVE' },
          ],
          page: { ...PAGE, totalItems: 2 },
        }),
      );
    const onClose = renderDialog();

    await user.click(await screen.findByRole('combobox', { name: 'Organisation' }));
    await user.click(screen.getByRole('option', { name: /Imara SACCO/ }));
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/admin');
    expect(await screen.findByText(/Imara SACCO · All branches/)).toBeInTheDocument();
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement `components/shell/context-switcher-dialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { useToast } from '@/components/providers/toast-provider';
import { fetchOrganisations, isSessionExpired } from '@/components/context/context-api';
import { ContextSelectionForm } from '@/components/context/context-selection-form';
import type { SelectionOutcome } from '@/components/context/use-context-selection';
import { useApplicationContext } from './organization-context';

interface ContextSwitcherDialogProps {
  open: boolean;
  onClose: () => void;
  platformOrganisationId: string;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; organisations: BrowserPage<BrowserOrganisation> }
  | { kind: 'error' };

/** "Switch working context" (prototype ContextModal) over the shared selection form. */
export function ContextSwitcherDialog({
  open,
  onClose,
  platformOrganisationId,
}: ContextSwitcherDialogProps) {
  const router = useRouter();
  const notify = useToast();
  const current = useApplicationContext();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [committed, setCommitted] = useState<{ id: string; name: string } | null>(null);

  const homeFor = (organisationId: string) =>
    organisationId === platformOrganisationId ? '/platform-admin' : '/admin';

  const nameOf = (organisationId: string) =>
    load.kind === 'ready'
      ? (load.organisations.items.find((item) => item.organisationId === organisationId)
          ?.displayName ?? '')
      : '';

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    fetchOrganisations(0)
      .then((organisations) => {
        if (!cancelled) setLoad({ kind: 'ready', organisations });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isSessionExpired(error)) {
          router.replace('/login?reason=session_expired');
          return;
        }
        setLoad({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, router]);

  const reset = () => {
    setLoad({ kind: 'loading' });
    setCommitted(null);
  };

  const finish = (outcome: SelectionOutcome) => {
    const name = nameOf(outcome.organisationId);
    reset();
    onClose();
    notify(
      outcome.kind === 'institution' ? `Switched to ${name} · All branches` : `Switched to ${name}`,
    );
    if (outcome.organisationId === current.organization.id) {
      router.refresh();
    } else {
      router.push(homeFor(outcome.organisationId));
    }
  };

  const close = () => {
    if (committed) {
      // The organisation token is already issued; without a branch the context is institution level.
      finish({ kind: 'institution', organisationId: committed.id });
      return;
    }
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="context-switcher-title"
    >
      <DialogTitle id="context-switcher-title">
        <Typography
          variant="overline"
          component="span"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          Organisation and branch
        </Typography>
        Switch working context
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Typography color="text.secondary">
            Available actions depend on your active membership and branch assignment. All branches
            lets multi-branch users administer every branch at institution level.
          </Typography>
          {load.kind === 'loading' && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Loading organisations…</Typography>
            </Stack>
          )}
          {load.kind === 'error' && (
            <Alert severity="error">We couldn&apos;t load organisations. Please try again.</Alert>
          )}
          {load.kind === 'ready' && (
            <ContextSelectionForm
              initialOrganisations={load.organisations}
              onComplete={finish}
              onOrganisationCommitted={(organisationId) => {
                setCommitted({ id: organisationId, name: nameOf(organisationId) });
              }}
              onSessionExpired={() => {
                router.replace('/login?reason=session_expired');
              }}
            />
          )}
          <Alert icon={<VerifiedUserOutlined fontSize="inherit" />} severity="info">
            Context switching is validated by the platform and never grants additional access.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={close}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

(State updates happen only in the promise callbacks, never synchronously in the effect body, and
the dialog resets itself in its close paths — so reopening starts from "loading" again.)

- [ ] **Step 5: Wire the dialog, the admin guard, and the platform id**

In `components/shell/app-shell.tsx`: wrap the returned tree in `<ToastProvider>` (inside
`ApplicationContextProvider`), add `const [contextOpen, setContextOpen] = useState(false);`, pass
`onOpenContextSwitcher={() => { setContextOpen(true); }}` to `GlobalHeader`, and render
`<ContextSwitcherDialog open={contextOpen} onClose={() => { setContextOpen(false); }}
platformOrganisationId={platformOrganisationId} />` after the layout box. Add
`platformOrganisationId: string` to `AppShellProps`.

In `components/shell/global-header.tsx`: replace the context `Button`'s `component`/`href` props with
`onClick={onOpenContextSwitcher}` and `aria-haspopup="dialog"`; add `onOpenContextSwitcher: () =>
void` to the props. Update the header test: replace the href test with

```tsx
it('opens the context switcher', async () => {
  const user = userEvent.setup();
  const onOpenContextSwitcher = vi.fn();
  renderWithProviders(
    <ApplicationContextProvider value={CONTEXT}>
      <GlobalHeader
        user={USER}
        onOpenNavigation={vi.fn()}
        onOpenContextSwitcher={onOpenContextSwitcher}
      />
    </ApplicationContextProvider>,
  );

  await user.click(screen.getByRole('button', { name: /switch organisation or branch/i }));
  expect(onOpenContextSwitcher).toHaveBeenCalledTimes(1);
});
```

and pass `onOpenContextSwitcher={vi.fn()}` in the other renders.

In `app/(authenticated)/layout.tsx`: import `serverEnv` from `@/config/env.server` and pass
`platformOrganisationId={serverEnv.PLATFORM_ORGANISATION_ID}`; extend its test's expected props
(mock `@/config/env.server` with `{ serverEnv: { PLATFORM_ORGANISATION_ID: 'platform-org' } }`).

Create `app/(authenticated)/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';

/** Tenant Administration is not available in the platform context (the API rejects it). */
export default async function AdministrationLayout({ children }: { children: ReactNode }) {
  const selectedContext = await getCurrentContextProfile();
  if (
    selectedContext.kind === 'resolved' &&
    selectedContext.context.module.id === platformAdministrationModule.id
  ) {
    redirect('/platform-admin');
  }
  return <>{children}</>;
}
```

`app/(authenticated)/admin/layout.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

const getCurrentContextProfile = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));

const { default: AdministrationLayout } = await import('./layout');

describe('AdministrationLayout', () => {
  it('renders tenant pages for a tenant context', async () => {
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      context: { module: { id: 'administration', name: 'Administration' } },
    });
    render(await AdministrationLayout({ children: <div>Tenant page</div> }));
    expect(screen.getByText('Tenant page')).toBeInTheDocument();
  });

  it('sends platform contexts to the platform workspace', async () => {
    getCurrentContextProfile.mockResolvedValueOnce({
      kind: 'resolved',
      context: { module: { id: 'platform-administration', name: 'Platform Administration' } },
    });
    await expect(AdministrationLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/platform-admin');
  });
});
```

- [ ] **Step 6: Run and commit**

Run: `pnpm check` → PASS.

```bash
git add -A components app
git commit -m "$(cat <<'EOF'
feat(shell): switch organisation and branch from the app bar with toasts and a workspace guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Two-tile app switcher

**Files:**

- Modify: `components/shell/app-switcher.tsx` (full rewrite), `app-switcher.test.tsx` (full rewrite)
- Delete: `components/shell/shell.constants.ts`
- Modify: `components/shell/global-header.tsx` (workspace label becomes a switcher trigger; icon
  trigger kept), `components/shell/app-shell.tsx` (pass `platformOrganisationId`, current module id,
  and `onOpenContextSwitcher` into the switcher)
- Modify: `e2e/keycloak-smoke.spec.ts` (tile buttons instead of menu items)

**Interfaces:**

- Produces: `AppSwitcher({ currentModuleId, platformOrganisationId, onOpenContextSwitcher, trigger })`
  where `trigger: 'icon' | 'label'` renders the grid icon button or the workspace label button; both
  open the same popover. Opening fetches `/api/context/organisations?page=0`; the Platform tile shows
  only if the list includes `platformOrganisationId`. Tiles: Administration ("Institution controls"),
  Platform administration ("Tenant governance").

- [ ] **Step 1: Write the failing switcher test**

`components/shell/app-switcher.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppSwitcher } from './app-switcher';

const push = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) };
});

const PAGE = {
  number: 0,
  size: 25,
  totalItems: 2,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};
function organisations(ids: string[]) {
  return new Response(
    JSON.stringify({
      items: ids.map((id) => ({
        organisationId: id,
        membershipId: `m-${id}`,
        tenantCode: id,
        displayName: id,
        organisationStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
      })),
      page: PAGE,
    }),
    { status: 200 },
  );
}

describe('AppSwitcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it('offers only Administration when the user has no platform membership', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(organisations(['umoja']));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={vi.fn()}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));

    expect(await screen.findByRole('button', { name: /Administration/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Platform administration/ }),
    ).not.toBeInTheDocument();
  });

  it('switches into the platform workspace through the real context change', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(organisations(['umoja', 'platform']))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branchId: 'ops',
            requiresBranchSelection: false,
            assignedBranchIds: ['ops'],
          }),
          { status: 200 },
        ),
      );
    renderWithProviders(
      <AppSwitcher
        currentModuleId="administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={vi.fn()}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Platform administration/ }));

    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith('/platform-admin');
    });
  });

  it('asks for a tenant organisation when switching back to Administration', async () => {
    const user = userEvent.setup();
    const onOpenContextSwitcher = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(organisations(['umoja', 'platform']));
    renderWithProviders(
      <AppSwitcher
        currentModuleId="platform-administration"
        platformOrganisationId="platform"
        onOpenContextSwitcher={onOpenContextSwitcher}
        trigger="icon"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch application' }));
    await user.click(await screen.findByRole('button', { name: /Administration/ }));

    expect(onOpenContextSwitcher).toHaveBeenCalledTimes(1);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Rewrite `components/shell/app-switcher.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import { fetchOrganisations, selectOrganisationRequest } from '@/components/context/context-api';
import { nextStepAfterOrganisation } from '@/components/context/use-context-selection';

type ModuleId = 'administration' | 'platform-administration';

interface AppSwitcherProps {
  currentModuleId: ModuleId;
  platformOrganisationId: string;
  onOpenContextSwitcher: () => void;
  trigger: 'icon' | 'label';
  moduleName?: string;
}

interface TileProps {
  title: string;
  description: string;
  selected: boolean;
  icon: typeof SettingsOutlined;
  onClick: () => void;
}

function Tile({ title, description, selected, icon: Icon, onClick }: TileProps) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      sx={(theme) => ({
        minHeight: 126,
        p: 3.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 1.5,
        textAlign: 'left',
        border: `1px solid ${selected ? theme.vars.palette.primary.main : theme.vars.palette.divider}`,
        borderRadius: 1,
        backgroundColor: selected ? theme.vars.palette.status.infoBg : 'transparent',
        '&:hover': {
          borderColor: theme.vars.palette.primary.main,
          backgroundColor: theme.vars.palette.status.infoBg,
        },
      })}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '8px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Icon aria-hidden="true" />
      </Box>
      <Typography component="span" variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography component="span" variant="caption" color="text.secondary">
        {description}
      </Typography>
    </ButtonBase>
  );
}

/** Fiori-style two-workspace switcher (prototype `.app-switch`). Switching is a real context change. */
export function AppSwitcher({
  currentModuleId,
  platformOrganisationId,
  onOpenContextSwitcher,
  trigger,
  moduleName,
}: AppSwitcherProps) {
  const router = useRouter();
  const popoverId = useId();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hasPlatform, setHasPlatform] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    // ponytail: first page (25) of organisations only; a platform member with >25 memberships
    // would not see the tile — page through if that ever happens.
    void fetchOrganisations(0)
      .then((page) => {
        setHasPlatform(page.items.some((item) => item.organisationId === platformOrganisationId));
      })
      .catch(() => {
        setHasPlatform(false);
      });
  };

  const close = () => {
    setAnchorEl(null);
  };

  const openAdministration = () => {
    close();
    if (currentModuleId !== 'administration') {
      onOpenContextSwitcher();
    }
  };

  const openPlatform = async () => {
    if (currentModuleId === 'platform-administration') {
      close();
      return;
    }
    setSwitching(true);
    try {
      const selection = await selectOrganisationRequest(platformOrganisationId);
      const step = nextStepAfterOrganisation(selection);
      close();
      if (step === 'done-branch' || step === 'done-institution') {
        router.push('/platform-admin');
        router.refresh();
        return;
      }
      onOpenContextSwitcher();
    } catch {
      close();
      onOpenContextSwitcher();
    } finally {
      setSwitching(false);
    }
  };

  const triggerProps = {
    'aria-controls': open ? popoverId : undefined,
    'aria-haspopup': 'true' as const,
    'aria-expanded': open ? ('true' as const) : undefined,
    onClick: handleOpen,
  };

  return (
    <>
      {trigger === 'icon' ? (
        <Tooltip title="Switch application">
          <IconButton aria-label="Switch application" {...triggerProps}>
            <AppsOutlined />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          aria-label={`Current workspace: ${moduleName ?? ''}. Switch application`}
          startIcon={<AppsOutlined aria-hidden="true" />}
          endIcon={<KeyboardArrowDownOutlined aria-hidden="true" />}
          sx={{ height: 46, display: { xs: 'none', sm: 'inline-flex' } }}
          {...triggerProps}
        >
          {moduleName}
        </Button>
      )}
      <Popover
        id={popoverId}
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, p: 3.5 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Finaxis apps
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 3 }}>
          Choose a workspace
        </Typography>
        {hasPlatform === null || switching ? (
          <Box role="status" sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={20} aria-label="Loading workspaces" />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Tile
              title="Administration"
              description="Institution controls"
              icon={SettingsOutlined}
              selected={currentModuleId === 'administration'}
              onClick={openAdministration}
            />
            {hasPlatform && (
              <Tile
                title="Platform administration"
                description="Tenant governance"
                icon={DomainOutlined}
                selected={currentModuleId === 'platform-administration'}
                onClick={() => {
                  void openPlatform();
                }}
              />
            )}
          </Box>
        )}
      </Popover>
    </>
  );
}
```

- [ ] **Step 3: Use both triggers in the header**

In `components/shell/global-header.tsx`: replace the non-interactive workspace `Box` with
`<AppSwitcher trigger="label" moduleName={module.name} currentModuleId={module.id}
platformOrganisationId={platformOrganisationId} onOpenContextSwitcher={onOpenContextSwitcher} />`,
and the right-side `<AppSwitcher />` with the same props but `trigger="icon"`. Add
`platformOrganisationId: string` to `GlobalHeaderProps`; pass it from `AppShell`. Update the header
tests' renders with `platformOrganisationId="platform"` and replace the "Administration" text
assertion with `screen.getByRole('button', { name: /current workspace: administration/i })`.
Delete `components/shell/shell.constants.ts`.

In `e2e/keycloak-smoke.spec.ts`, click `page.getByRole('button', { name: 'Switch application',
exact: true })` (two triggers now carry that phrase) and replace the `menuitem` assertion with
`await expect(page.getByRole('button', { name: /^Administration/ })).toBeVisible();`.

- [ ] **Step 4: Run and commit**

Run: `pnpm check` → PASS.

```bash
git add -A components e2e/keycloak-smoke.spec.ts
git commit -m "$(cat <<'EOF'
feat(shell): replace the module menu with the two-workspace app switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Safe `next` destinations

**Files:**

- Create: `auth/context-destination.ts`, `auth/context-destination.test.ts`
- Modify: `app/select-context/page.tsx`, `app/select-context/page.test.tsx`
- Modify: `components/context/context-selection-page.tsx` (remove the `ContextSelectionDestination`
  union — `destination: string`)

**Interfaces:**

- Produces: `DEFAULT_CONTEXT_DESTINATION = '/profile'`, `safeContextDestination(value: string |
undefined): string`.

- [ ] **Step 1: Write the failing test**

`auth/context-destination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_DESTINATION, safeContextDestination } from './context-destination';

describe('safeContextDestination', () => {
  it.each([
    '/admin',
    '/admin/users/0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b/roles',
    '/platform-admin/tenants',
    '/profile',
    '/profile/contexts',
  ])('keeps the allowed in-app path %s', (path) => {
    expect(safeContextDestination(path)).toBe(path);
  });

  it.each([
    undefined,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/admin//users',
    '/admin/../login',
    '/administrator',
    '/login',
    '/api/auth/logout',
    '/admin?next=https://evil.example',
    `/admin/${'a'.repeat(250)}`,
  ])('falls back for %s', (path) => {
    expect(safeContextDestination(path)).toBe(DEFAULT_CONTEXT_DESTINATION);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `auth/context-destination.ts`**

```ts
/**
 * Post-context-selection destinations: only same-origin authenticated app paths under an
 * allow-listed prefix (AGENTS.md: never accept an unvalidated redirect).
 */
export const DEFAULT_CONTEXT_DESTINATION = '/profile';

const ALLOWED_PREFIXES = ['/admin', '/platform-admin', '/profile'] as const;
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;
const MAX_LENGTH = 200;

export function safeContextDestination(value: string | undefined): string {
  if (!value || value.length > MAX_LENGTH || !SAFE_PATH.test(value) || value.includes('//')) {
    return DEFAULT_CONTEXT_DESTINATION;
  }
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  );
  return allowed ? value : DEFAULT_CONTEXT_DESTINATION;
}
```

- [ ] **Step 3: Use it in `app/select-context/page.tsx`**

Delete `ALLOWED_DESTINATIONS` and replace `selectedDestination` with:

```ts
async function selectedDestination(
  searchParams: SelectContextPageProps['searchParams'],
): Promise<string> {
  const params = (await searchParams) ?? {};
  return safeContextDestination(firstParam(params.next) ?? firstParam(params.returnTo));
}
```

Update `page.test.tsx`: expectations that relied on the old list stay valid for listed paths; add a
case that a nested path (`/admin/users/<uuid>`) is preserved and one that an external URL falls back
to `/profile`.

- [ ] **Step 4: Run and commit**

Run: `pnpm check` → PASS.

```bash
git add auth/context-destination.ts auth/context-destination.test.ts app/select-context components/context
git commit -m "$(cat <<'EOF'
feat(context): validate post-selection destinations by prefix allow-list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Fake-API scenarios, E2E, live read check

**Files:**

- Modify: `e2e/fake-api/scenarios.mts` (add `multi-org`, `duplicate-assignments`, `no-branches`),
  `e2e/support/auth.ts` (`FakeApiScenario` union)
- Create: `e2e/context.spec.ts`

- [ ] **Step 1: Add scenarios**

In `e2e/fake-api/scenarios.mts` add before `BUILDERS`:

```ts
function multiOrg(): RunState {
  const tenant = greenfieldTenant();
  const platform = platformOperator();
  return {
    ...tenant,
    organisations: [...tenant.organisations, ...platform.organisations],
    memberships: [...tenant.memberships, ...platform.memberships],
    branches: [...tenant.branches, ...platform.branches],
    branchAssignments: [...tenant.branchAssignments, ...platform.branchAssignments],
    roles: [...tenant.roles, ...platform.roles],
    roleAssignments: [...tenant.roleAssignments, ...platform.roleAssignments],
  };
}

function duplicateAssignments(): RunState {
  const state = greenfieldTenant();
  // HOME and OPERATE at Head Office only: the backend lists the branch twice and doesn't auto-select.
  return {
    ...state,
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000011',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'HOME',
      ),
      assignment(
        'b0000000-0000-4000-8000-000000000012',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'OPERATE',
      ),
    ],
  };
}

function noBranches(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    memberships: state.memberships.map((membership) => ({ ...membership, type: 'AUDITOR' })),
    branchAssignments: [],
  };
}
```

Register `'multi-org': multiOrg, 'duplicate-assignments': duplicateAssignments, 'no-branches':
noBranches,` and extend `FakeApiScenario`.

- [ ] **Step 2: Write `e2e/context.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

test.describe('working context', () => {
  test('offers All branches to multi-branch users and shows it in the shell', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/admin');
    await selectMuiOption(page, 'Organisation', /Greenfield/);
    await selectMuiOption(page, 'Branch', /All branches \(institution level\)/);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible();
  });

  test('pins a single distinct branch even when the backend lists it twice', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'duplicate-assignments');
    await page.goto('/admin');
    await selectMuiOption(page, 'Organisation', /Greenfield/);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();
  });

  test('uses institution level for members without branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-branches');
    await page.goto('/admin');
    await selectMuiOption(page, 'Organisation', /Greenfield/);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible();
  });

  test('switches branch from the app bar dialog', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/admin');
    await selectMuiOption(page, 'Organisation', /Greenfield/);
    await selectMuiOption(page, 'Branch', /Head Office/);

    await page.getByRole('button', { name: /switch organisation or branch/i }).click();
    const dialog = page.getByRole('dialog', { name: /switch working context/i });
    await dialog.getByRole('combobox', { name: 'Organisation' }).click();
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: /Westlands/ }).click();

    await expect(page.getByRole('banner').getByText('Westlands Branch')).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: /Switched to Greenfield SACCO/ }),
    ).toBeVisible();
  });

  test('moves between workspaces with the app switcher', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'multi-org');
    await page.goto('/admin');
    await selectMuiOption(page, 'Organisation', /Greenfield/);
    await selectMuiOption(page, 'Branch', /Head Office/);

    await page.getByRole('button', { name: 'Switch application', exact: true }).click();
    await page.getByRole('button', { name: /Platform administration/ }).click();

    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(page.getByRole('banner').getByText('Platform', { exact: true })).toBeVisible();
  });

  test('keeps a deep link through context selection', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');
    await page.goto('/platform-admin/tenants/99999999-9999-4999-8999-999999999999');
    await selectMuiOption(page, 'Organisation', /Platform/);

    await expect(page).toHaveURL(
      /\/platform-admin\/tenants\/99999999-9999-4999-8999-999999999999$/,
    );
  });
});
```

- [ ] **Step 3: Gates**

```bash
pnpm exec prettier --write e2e
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass.

- [ ] **Step 4: Live read check against dev (with the user)**

Ask the user to start `pnpm dev` (their `.env.local` points at dev) and sign in once in the browser
pane. Then, with the browser pane: select a tenant organisation as (a) a single-branch user (expect
auto-pin), (b) a multi-branch user (expect the All branches option; choose it and confirm the header
shows "All branches" and `/admin` renders), (c) the platform organisation (expect `/platform-admin`).
Confirm the tenant directory loads without errors. Note any response that failed schema validation
(the error boundary shows a reference; check the server log) and fix the contract/schema in this
layer.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "$(cat <<'EOF'
test(e2e): cover All branches, auto-pinning, the context dialog, and the app switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
