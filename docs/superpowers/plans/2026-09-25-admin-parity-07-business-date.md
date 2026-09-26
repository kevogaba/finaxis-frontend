# PR 07: Business Date and the Mutation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Ship `/admin/business-date` (current date, close-of-business cycle, advance, history) and
the app-bar business date, together with the first Server Actions — the mutation pipeline every later
slice reuses.

**Architecture:** `runServerAction` (`lib/api/action-result.ts`) is the only way a Server Action talks
to the backend: session check → zod validation of the submitted `FormData` → `apiPost` with the
**client's** idempotency key → `refresh()`; failures become a safe `ActionResult`. `ReasonDialog`
drives any such action through React's `useActionState`, holding one idempotency key per opening.
Business dates stay `dd-MM-yyyy` strings end to end (`lib/business-date.ts`).

**Tech Stack:** Next.js 16 Server Actions (`refresh` from `next/cache`, `unstable_rethrow`), React 19
`useActionState`, React `cache`, zod 4, MUI 9 (`Dialog`, `Button loading`, `Chip`, `Table`),
Vitest, Playwright.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §6.1, §6.4, §8 (app
bar), §9 (`ReasonDialog`, `SectionCard`), §10.2; contract §A (`date`, idempotency), §C
(`BusinessDateResponse`, `BusinessDateHistoryEntry`), §D (`AdvanceBusinessDate`,
`BusinessDateStatusTransition`), §E (business date endpoints), §I (problem codes).

## Global Constraints

See the index. Additionally:

- Business dates are compared and rendered from their parts — never `new Date('dd-MM-yyyy')`, never
  string comparison. `<input type="date">` values (`yyyy-MM-dd`) are converted explicitly.
- Request bodies: always an object (`{}` when empty); `reason` only when non-blank.
- Every mutation button needs its permission **and** `business_date.view` (BG-31).
- Dialogs with one or two fields use native constraints + server-side zod (`useActionState`), not
  React Hook Form; RHF arrives with the first multi-field form (PR 08+), per spec §6.4.
- `ConfirmDialog` (no reason field) has no consumer yet — `ReasonDialog` covers every action here.
- **Live checks:** reads first. Mutations only with the user's explicit approval per action, on the
  dev tenant they designate, and limited to start → complete → reopen (which returns to OPEN on the
  same date). **Never advance the dev business date** unless the user explicitly approves moving it
  forward — it cannot be undone.

## Review Focus

Pins index item 2 (double submit / retry after failure — Task 3 dialog key tests, Task 4 action key
forwarding, Task 6 fake idempotency spec and the lock-timeout retry E2E) and adds:

1. A retry after a failure must reuse the idempotency key (a safe replay), and a new opening must use
   a new key (Task 3; Task 6 cycle E2E fails with `IDEMPOTENCY_KEY_REUSED` if keys leak between
   dialogs).
2. Malformed or impossible business dates (`31-02-2026`, ISO, unpadded) never render as a wrong date:
   the schema rejects them → error state (Tasks 2, 4).
3. Dates compare by calendar: `01-10-2026` is after `30-09-2026` (Task 2).
4. A failing business date read never takes down the shell — the indicator renders nothing (Task 5).
5. Long reasons in history stay on one line with the full text available (Task 5).

---

### Task 1: The mutation pipeline

**Files:**

- Modify: `auth/backend-api.ts` (optional caller key on `post`), `auth/backend-api.test.ts`
- Modify: `lib/api/tenant-api.ts` (`apiPost`); Create: `lib/api/tenant-api.test.ts`
- Modify: `lib/api/problem.ts` (code-specific messages), `lib/api/problem.test.ts`
- Create: `lib/api/action-result.ts`, `lib/api/action-result.test.ts`
- Modify: `AGENTS.md`, `README.md`, `docs/deployment.md`

**Interfaces:**

- Consumes: PR 06 `apiGet`, `describeProblem`, `redirectIfSessionLost`; PR 05 `BackendApiError`
  (`code`, `requestId`).
- Produces:
  - `backendApi.post<T>(path, body, headers, contextToken?, idempotencyKey = crypto.randomUUID())`.
  - `apiPost(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<unknown>`.
  - `type ActionResult = { ok: true } | { ok: false; formError: string; fieldErrors:
Partial<Record<string, string>>; code: string | null; requestId: string | null }`.
  - `type FormAction = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>`.
  - `runServerAction<S extends z.ZodType>(schema: S, formData: FormData, run: (input: z.output<S>) =>
Promise<unknown>): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing tests**

Append to `auth/backend-api.test.ts` (inside `describe('backendApi')`, reusing `fetchMock` and
`requestHeaders`):

```ts
it('forwards a caller-supplied idempotency key', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const key = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  await backendApi.post('/api/v1/tenant/business-date/cob/start', {}, requestHeaders, 'ctx', key);

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(new Headers(init.headers).get('Idempotency-Key')).toBe(key);
});
```

`lib/api/tenant-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readContextToken = vi.fn();
const post = vi.fn();
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/auth/context-cookie', () => ({
  readContextToken: () => readContextToken() as unknown,
}));
vi.mock('@/auth/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/backend-api')>();
  return { ...actual, backendApi: { post: (...args: unknown[]) => post(...args) as unknown } };
});

const { apiPost } = await import('./tenant-api');

describe('apiPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the body with the context token and the caller key', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    post.mockResolvedValueOnce({ ok: true });

    await apiPost('/api/v1/tenant/business-date/reopen', {}, 'key-1');

    expect(post).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date/reopen',
      {},
      expect.any(Headers),
      'ctx-token',
      'key-1',
    );
  });

  it('treats a missing context token as a stale context', async () => {
    readContextToken.mockResolvedValueOnce(null);

    await expect(apiPost('/api/v1/tenant/business-date/reopen', {}, 'key-1')).rejects.toMatchObject(
      {
        status: 403,
        code: 'invalid_active_tenant_context',
      },
    );
    expect(post).not.toHaveBeenCalled();
  });
});
```

Append to `lib/api/problem.test.ts`:

```ts
describe('code-specific problems', () => {
  it.each([
    ['lifecycle.business_date_lock_timeout', 'Busy — try again'],
    ['IDEMPOTENCY_KEY_REUSED', 'Already submitted'],
    ['IDEMPOTENCY_REQUEST_IN_PROGRESS', 'Still processing'],
  ])('gives %s its own message', (code, title) => {
    expect(describeProblem(new BackendApiError(409, { code })).title).toBe(title);
  });
});
```

`lib/api/action-result.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const refresh = vi.fn();
const getAuthenticatedUser = vi.fn();
vi.mock('next/cache', () => ({ refresh: () => refresh() as unknown }));
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve(new Headers({ 'x-finaxis-pathname': '/admin/business-date' })),
  ),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT')) throw error;
  }),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));

const { runServerAction } = await import('./action-result');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const schema = z.object({ idempotencyKey: z.uuid(), reason: z.string().max(5) });

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('runServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
  });

  it('runs with the parsed fields (including the client key) and refreshes', async () => {
    const run = vi.fn(() => Promise.resolve());

    await expect(
      runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), run),
    ).resolves.toEqual({
      ok: true,
    });
    expect(run).toHaveBeenCalledWith({ idempotencyKey: KEY, reason: 'ok' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns field errors without calling the backend', async () => {
    const run = vi.fn();

    const result = await runServerAction(
      schema,
      form({ idempotencyKey: KEY, reason: 'too long' }),
      run,
    );

    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(result.ok ? null : result.fieldErrors.reason).toEqual(expect.any(String));
    expect(run).not.toHaveBeenCalled();
  });

  it('maps backend failures to a safe result with the support reference', async () => {
    const result = await runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), () =>
      Promise.reject(
        new BackendApiError(409, {
          code: 'lifecycle.business_date_lock_timeout',
          requestId: 'req-7',
        }),
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {},
      code: 'lifecycle.business_date_lock_timeout',
      requestId: 'req-7',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('redirects an expired session and a stale context', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);
    await expect(runServerAction(schema, form({}), vi.fn())).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );

    await expect(
      runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), () =>
        Promise.reject(new BackendApiError(403, { code: 'invalid_active_tenant_context' })),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/select-context?next=%2Fadmin%2Fbusiness-date');
  });
});
```

Run: `pnpm test:run auth/backend-api.test.ts lib/api`
Expected: FAIL (`apiPost`, `runServerAction` missing; the key and code tests fail).

- [ ] **Step 2: Accept a caller key in `auth/backend-api.ts`**

Replace the `post` method:

```ts
  post<T>(
    path: string,
    body: Record<string, unknown>,
    headers: Headers,
    contextToken?: string,
    // Server Actions pass the key the form minted when it opened (spec §6.4) so a retry replays.
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<T> {
    return request<T>(
      path,
      headers,
      {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        method: 'POST',
      },
      contextToken,
    );
  },
```

- [ ] **Step 3: Add `apiPost` to `lib/api/tenant-api.ts`**

Replace the file body below the imports:

```ts
async function contextRequest(): Promise<{ requestHeaders: Headers; contextToken: string }> {
  const requestHeaders = await headers();
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    throw new BackendApiError(403, { code: 'invalid_active_tenant_context' });
  }
  return { requestHeaders, contextToken };
}

/**
 * GET a context-scoped backend resource and validate it. A missing context token is treated like a
 * stale context so pages send the user back through context selection (lib/api/load.ts).
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const { requestHeaders, contextToken } = await contextRequest();
  return schema.parse(await backendApi.get<unknown>(path, requestHeaders, contextToken));
}

/** POST a context-scoped mutation with the caller's idempotency key. Callers parse what they use. */
export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  const { requestHeaders, contextToken } = await contextRequest();
  return backendApi.post<unknown>(path, body, requestHeaders, contextToken, idempotencyKey);
}
```

- [ ] **Step 4: Add code-specific messages to `lib/api/problem.ts`**

Add below `BY_STATUS`:

```ts
/** Codes whose remedy differs from their status's generic advice (contract §I). */
const BY_CODE: Record<string, Pick<ProblemView, 'title' | 'message'>> = {
  'lifecycle.business_date_lock_timeout': {
    title: 'Busy — try again',
    message: 'Another business date change is in progress. Try again in a moment.',
  },
  IDEMPOTENCY_REQUEST_IN_PROGRESS: {
    title: 'Still processing',
    message: 'This request is still being processed. Wait a moment, then refresh the page.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    title: 'Already submitted',
    message:
      'This request was already submitted with different details. Close this and start again.',
  },
};
```

and change the `BackendApiError` branch's lookup to:

```ts
const known = (error.code ? BY_CODE[error.code] : undefined) ?? BY_STATUS[error.status] ?? GENERIC;
```

- [ ] **Step 5: Implement `lib/api/action-result.ts`**

```ts
import 'server-only';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { redirectIfSessionLost } from './load';
import { describeProblem } from './problem';

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      formError: string;
      fieldErrors: Partial<Record<string, string>>;
      code: string | null;
      requestId: string | null;
    };

/** The shape `useActionState` expects of a form's Server Action. */
export type FormAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

/**
 * Every Server Action runs through here (spec §6.4): session → zod-validated form fields → the
 * backend call → `refresh()`. Failures become a safe `ActionResult`, never a raw backend payload.
 */
export async function runServerAction<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  run: (input: z.output<S>) => Promise<unknown>,
): Promise<ActionResult> {
  const requestHeaders = await headers();
  if (!(await getAuthenticatedUser(requestHeaders))) {
    redirect('/login?reason=session_expired');
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
    }
    return {
      ok: false,
      formError: 'Check the highlighted fields and try again.',
      fieldErrors,
      code: 'validation_failed',
      requestId: null,
    };
  }

  try {
    await run(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    redirectIfSessionLost(error, requestHeaders);
    const problem = describeProblem(error);
    return {
      ok: false,
      formError: problem.message,
      fieldErrors: {},
      code: problem.code,
      requestId: problem.requestId,
    };
  }

  refresh();
  return { ok: true };
}
```

Run: `pnpm test:run auth/backend-api.test.ts lib/api` → PASS.

- [ ] **Step 6: Document the pipeline**

`AGENTS.md`, below the MUI v9 rule:

```md
- Mutations are Server Actions built on `runServerAction` (`lib/api/action-result.ts`). Forward the
  idempotency key the form minted when it opened (`ReasonDialog` does this) — never generate one per
  request — so a retry after a failure replays instead of repeating the change.
```

`README.md` → "Directory structure": add `lib/api/` — "server-only API layer: wire primitives,
context-scoped `apiGet`/`apiPost`, problem → UI mapping, page loaders, the Server Action pipeline,
and cached name lookups".

`docs/deployment.md` → environment variable table, new row after `PLATFORM_ORGANISATION_ID`:

```md
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Only when running more than one instance. Base64 AES key (`openssl rand -base64 32`), identical on every instance. **Build + Runtime**: Next.js embeds it in the build output. |
```

Run `pnpm exec prettier --write AGENTS.md README.md docs/deployment.md`.

- [ ] **Step 7: Commit**

```bash
git add auth/backend-api.ts auth/backend-api.test.ts lib/api AGENTS.md README.md docs/deployment.md
git commit -m "$(cat <<'EOF'
feat(api): add the Server Action pipeline with client idempotency keys and safe results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Business date primitives

**Files:**

- Create: `lib/business-date.ts`, `lib/business-date.test.ts`
- Modify: `lib/api/wire.ts` (`businessDateSchema`), `lib/api/wire.test.ts`
- Modify: `lib/format.ts` (`formatBusinessDate`), `lib/format.test.ts`

**Interfaces:**

- Produces:
  - `businessDateDay(value: string): number | null` — days since the epoch for a strict
    `dd-MM-yyyy` calendar date.
  - `isoToBusinessDate(iso: string): string | null` (`yyyy-MM-dd` → `dd-MM-yyyy`),
    `nextBusinessDateIso(value: string): string | null` (the day after, as `yyyy-MM-dd`).
  - `businessDateSchema` (zod string refined with `businessDateDay`).
  - `formatBusinessDate(value: string, style: 'short' | 'long'): string` — `Mon, 7 Sep 2026` /
    `Monday, 7 September 2026`.

- [ ] **Step 1: Write the failing tests**

`lib/business-date.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { businessDateDay, isoToBusinessDate, nextBusinessDateIso } from './business-date';

describe('business dates', () => {
  it('accepts only strict dd-MM-yyyy calendar dates', () => {
    expect(businessDateDay('07-09-2026')).not.toBeNull();
    ['7-9-2026', '2026-09-07', '31-02-2026', '00-01-2026', '07/09/2026', ''].forEach((bad) => {
      expect(businessDateDay(bad)).toBeNull();
    });
  });

  it('orders by calendar, not by string', () => {
    // As strings '01-10-2026' < '30-09-2026', but 1 October is later.
    expect((businessDateDay('01-10-2026') ?? 0) > (businessDateDay('30-09-2026') ?? 0)).toBe(true);
  });

  it('converts date-input values and finds the next allowed date across month and year ends', () => {
    expect(isoToBusinessDate('2026-09-08')).toBe('08-09-2026');
    expect(isoToBusinessDate('2026-02-30')).toBeNull();
    expect(isoToBusinessDate('08-09-2026')).toBeNull();
    expect(nextBusinessDateIso('30-09-2026')).toBe('2026-10-01');
    expect(nextBusinessDateIso('31-12-2026')).toBe('2027-01-01');
  });
});
```

Append to `lib/api/wire.test.ts` (import `businessDateSchema`):

```ts
it('accepts dd-MM-yyyy business dates only', () => {
  expect(businessDateSchema.safeParse('07-09-2026').success).toBe(true);
  expect(businessDateSchema.safeParse('2026-09-07').success).toBe(false);
  expect(businessDateSchema.safeParse('31-02-2026').success).toBe(false);
});
```

Append to `lib/format.test.ts` (import `formatBusinessDate`):

```ts
it('formats business dates without timezone shifts', () => {
  expect(formatBusinessDate('07-09-2026', 'short')).toBe('Mon, 7 Sep 2026');
  expect(formatBusinessDate('07-09-2026', 'long')).toBe('Monday, 7 September 2026');
  expect(formatBusinessDate('31-12-2026', 'short')).toBe('Thu, 31 Dec 2026');
});
```

Run: `pnpm test:run lib` → FAIL.

- [ ] **Step 2: Implement `lib/business-date.ts`**

```ts
/**
 * Business dates are `dd-MM-yyyy` calendar dates with no timezone (contract §A). Never pass one to
 * `new Date(string)` or compare them as strings — use the day number.
 */
const BUSINESS_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;

/** Days since the epoch for a strict `dd-MM-yyyy` calendar date, or null. */
export function businessDateDay(value: string): number | null {
  const match = BUSINESS_DATE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time / DAY_MS
    : null;
}

/** `<input type="date">` value (`yyyy-MM-dd`) → `dd-MM-yyyy`, or null if it isn't a real date. */
export function isoToBusinessDate(iso: string): string | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const candidate = `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}`;
  return businessDateDay(candidate) === null ? null : candidate;
}

/** The day after a business date, as an `<input type="date">` value (for `min`). */
export function nextBusinessDateIso(value: string): string | null {
  const day = businessDateDay(value);
  return day === null ? null : new Date((day + 1) * DAY_MS).toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Add the schema and the formatter**

`lib/api/wire.ts` — import `businessDateDay` from `@/lib/business-date` and add:

```ts
/** `dd-MM-yyyy` business date (contract §A). */
export const businessDateSchema = z
  .string()
  .refine((value) => businessDateDay(value) !== null, 'Expected a dd-MM-yyyy business date');
```

`lib/format.ts` — import `DAY_MS` and `businessDateDay` from `@/lib/business-date` and add:

```ts
/** `dd-MM-yyyy` → `Mon, 7 Sep 2026` (short) or `Monday, 7 September 2026` (long); no zone shift. */
export function formatBusinessDate(value: string, style: 'short' | 'long'): string {
  const day = businessDateDay(value);
  if (day === null) return value;
  const date = new Date(day * DAY_MS);
  if (style === 'long') {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
    date,
  );
  return `${weekday}, ${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}
```

Run: `pnpm test:run lib` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/business-date.ts lib/business-date.test.ts lib/api/wire.ts lib/api/wire.test.ts lib/format.ts lib/format.test.ts
git commit -m "$(cat <<'EOF'
feat(business-date): parse, compare, convert, and format dd-MM-yyyy business dates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: `SectionCard` and `ReasonDialog`

**Files:**

- Create: `components/data-display/section-card.tsx`; Modify: `components/data-display/data-display.test.tsx`
- Create: `components/data-display/reason-dialog.tsx`, `reason-dialog.test.tsx`

**Interfaces:**

- Consumes: Task 1 `ActionResult`, `FormAction` (type-only imports).
- Produces:
  - `SectionCard({ title: string; description?: string; actions?: ReactNode; headingLevel?: 'h2' |
'h3'; children: ReactNode })` — a `section` landmark named by its heading.
  - `ReasonDialog({ open, title, description, confirmLabel, reason: 'optional' | 'required', action:
FormAction, onClose, onSuccess, fields?: (fieldErrors: Partial<Record<string, string>>) =>
ReactNode })`. Submits `idempotencyKey` (hidden) + `reason` + whatever `fields` renders.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (`--domain ux "confirmation dialog destructive action
loading feedback"`).

- [ ] **Step 2: Write the failing tests**

Append to `components/data-display/data-display.test.tsx` (import `SectionCard`):

```tsx
it('renders a section card as a landmark named by its heading', () => {
  renderWithProviders(
    <SectionCard title="Personal information" description="Identity details">
      <p>Body</p>
    </SectionCard>,
  );
  expect(screen.getByRole('region', { name: 'Personal information' })).toHaveTextContent('Body');
  expect(
    screen.getByRole('heading', { level: 2, name: 'Personal information' }),
  ).toBeInTheDocument();
});
```

`components/data-display/reason-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UUID_PATTERN } from '@/lib/api/wire';
import type { ActionResult } from '@/lib/api/action-result';
import { ReasonDialog } from './reason-dialog';

const BUSY: ActionResult = {
  ok: false,
  formError: 'Another business date change is in progress. Try again in a moment.',
  fieldErrors: {},
  code: 'lifecycle.business_date_lock_timeout',
  requestId: 'req-7',
};

function setup(
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>,
) {
  const onSuccess = vi.fn();
  const props = {
    title: 'Start close of business?',
    description: 'The business date moves to Closing.',
    confirmLabel: 'Start close of business',
    reason: 'optional' as const,
    action,
    onClose: vi.fn(),
    onSuccess,
  };
  const view = renderWithProviders(<ReasonDialog open {...props} />);
  return { ...view, props, onSuccess };
}

const keyOf = (formData: FormData | undefined) => String(formData?.get('idempotencyKey'));

describe('ReasonDialog', () => {
  it('submits the reason with an idempotency key and reports success', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { onSuccess } = setup(action);

    await user.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'End of day');
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const formData = action.mock.calls[0]?.[1];
    expect(formData?.get('reason')).toBe('End of day');
    expect(keyOf(formData)).toMatch(UUID_PATTERN);
  });

  it('shows a failure with its reference and retries with the same key (a safe replay)', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn((_previous: ActionResult | null, _formData: FormData) =>
        Promise.resolve<ActionResult>({ ok: true }),
      )
      .mockResolvedValueOnce(BUSY);
    const { onSuccess } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another business date change is in progress',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('req-7');

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(keyOf(action.mock.calls[1]?.[1])).toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('uses a fresh key each time the dialog opens', async () => {
    const user = userEvent.setup();
    const action = vi.fn((_previous: ActionResult | null, _formData: FormData) =>
      Promise.resolve<ActionResult>({ ok: true }),
    );
    const { props, rerender } = setup(action);

    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    rerender(<ReasonDialog {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    rerender(<ReasonDialog {...props} open />);
    await user.click(screen.getByRole('button', { name: 'Start close of business' }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });

    expect(keyOf(action.mock.calls[1]?.[1])).not.toBe(keyOf(action.mock.calls[0]?.[1]));
  });

  it('marks a required reason as required', () => {
    renderWithProviders(
      <ReasonDialog
        open
        title="Suspend?"
        description="Suspends access."
        confirmLabel="Suspend"
        reason="required"
        action={() => Promise.resolve<ActionResult>({ ok: true })}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Reason' })).toBeRequired();
  });
});
```

Run: `pnpm test:run components/data-display` → FAIL.

- [ ] **Step 3: Implement `SectionCard`**

`components/data-display/section-card.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface SectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  children: ReactNode;
}

/** Bordered surface with a header row (prototype `.surface` + `.surface-head`). */
export function SectionCard({
  title,
  description,
  actions,
  headingLevel = 'h2',
  children,
}: SectionCardProps) {
  const headingId = useId();
  return (
    <Paper component="section" aria-labelledby={headingId} sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          minHeight: 56,
          px: 4,
          py: 3.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={headingId} component={headingLevel} variant="h5">
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{actions}</Box>}
      </Box>
      {children}
    </Paper>
  );
}
```

(`useId` is available in Server Components.)

- [ ] **Step 4: Implement `ReasonDialog`**

`components/data-display/reason-dialog.tsx`:

```tsx
'use client';

import { useActionState, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import type { ActionResult, FormAction } from '@/lib/api/action-result';

type FieldErrors = Partial<Record<string, string>>;

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  reason: 'optional' | 'required';
  action: FormAction;
  onClose: () => void;
  onSuccess: () => void;
  /** Extra fields rendered above the reason (e.g. the advance date). */
  fields?: (fieldErrors: FieldErrors) => ReactNode;
}

const REASON_MAX = 500;
const NO_ERRORS: FieldErrors = {};

export function ReasonDialog({ open, onClose, ...form }: ReasonDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <ReasonForm {...form} onClose={onClose} />
    </Dialog>
  );
}

/**
 * Mounted once per opening (the dialog unmounts closed content): a fresh idempotency key and a
 * clean result each time. A failed attempt keeps its key, so retrying replays safely (spec §6.4).
 */
function ReasonForm({
  title,
  description,
  confirmLabel,
  reason,
  action,
  onClose,
  onSuccess,
  fields,
}: Omit<ReasonDialogProps, 'open'>) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.ok) onSuccess();
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.fieldErrors ?? NO_ERRORS;

  return (
    <Box component="form" action={formAction}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <DialogContentText>{description}</DialogContentText>
        {failure && (
          <Alert severity="error">
            {failure.formError}
            {failure.requestId && ` Reference: ${failure.requestId}`}
          </Alert>
        )}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {fields?.(fieldErrors)}
        <TextField
          name="reason"
          label={reason === 'required' ? 'Reason' : 'Reason (optional)'}
          required={reason === 'required'}
          multiline
          minRows={2}
          error={Boolean(fieldErrors.reason)}
          helperText={fieldErrors.reason}
          slotProps={{
            htmlInput: { maxLength: REASON_MAX, minLength: reason === 'required' ? 3 : undefined },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
```

(MUI `Dialog` names itself from `DialogTitle` automatically. `Box component="form" action={…}`
passes the function action straight to the `<form>`.)

Run: `pnpm test:run components/data-display` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/data-display
git commit -m "$(cat <<'EOF'
feat(ui): add SectionCard and a ReasonDialog that keeps one idempotency key per opening

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Business date contract, service, rules, and actions

**Files (all under `modules/administration/business-date/`):**

- Create: `business-date-contract.ts`, `business-date-contract.test.ts`
- Create: `business-date-service.ts`
- Create: `business-date-rules.ts`, `business-date-rules.test.ts`
- Create: `business-date-actions.ts`, `business-date-actions.test.ts`

**Interfaces:**

- Consumes: Task 1 (`apiPost`, `runServerAction`, `ActionResult`), Task 2 (`businessDateSchema`,
  `isoToBusinessDate`), PR 06 (`apiGet`, `pageSchema`, `instantSchema`, `toQueryString`), PR 04
  (`can`, `PermissionHolder`).
- Produces:
  - `type BusinessDateStatus = 'OPEN' | 'CLOSING' | 'CLOSED'`; `CurrentBusinessDate = { date: string;
status: BusinessDateStatus }`; `BusinessDateHistoryEntry = { eventType; fromStatus: string | null;
toStatus; fromBusinessDate: string | null; toBusinessDate; actorUserId: string | null; reason:
string | null; occurredAt }`.
  - `getBusinessDate(): Promise<CurrentBusinessDate>` (`cache`d — the page and the app-bar indicator
    share one read), `listBusinessDateHistory(paging: { page: number; size: number }):
Promise<Page<BusinessDateHistoryEntry>>`.
  - `type BusinessDateAction = 'cob.start' | 'business_date.advance' | 'cob.complete' |
'business_date.reopen'` (each is also its permission code), `availableBusinessDateActions(status,
holder): BusinessDateAction[]`, `historyEventLabel(eventType: string): string`.
  - Server Actions (`FormAction`s): `startCloseOfBusiness`, `completeCloseOfBusiness`,
    `reopenBusinessDate`, `advanceBusinessDate` (fields `idempotencyKey`, `reason`, and for advance
    `newBusinessDate` as `yyyy-MM-dd`).

- [ ] **Step 1: Write the failing tests**

`business-date-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { businessDateHistoryPageSchema, currentBusinessDateSchema } from './business-date-contract';

describe('business date contract', () => {
  it('maps the current business date', () => {
    expect(
      currentBusinessDateSchema.parse({
        organisation_id: 'o1',
        current_business_date: '07-09-2026',
        status: 'OPEN',
      }),
    ).toEqual({ date: '07-09-2026', status: 'OPEN' });
  });

  it('rejects an ISO date or an unknown status (schema drift)', () => {
    const base = { organisation_id: 'o1', current_business_date: '07-09-2026', status: 'OPEN' };
    expect(
      currentBusinessDateSchema.safeParse({ ...base, current_business_date: '2026-09-07' }).success,
    ).toBe(false);
    expect(currentBusinessDateSchema.safeParse({ ...base, status: 'PAUSED' }).success).toBe(false);
  });

  it('maps history entries, which carry no id', () => {
    const page = businessDateHistoryPageSchema.parse({
      items: [
        {
          event_type: 'ADVANCED',
          from_status: 'OPEN',
          to_status: 'OPEN',
          from_business_date: '04-09-2026',
          to_business_date: '07-09-2026',
          actor_id: 'u1',
          reason: null,
          occurred_at: '2026-09-07T05:00:00Z',
        },
      ],
      page: {
        number: 0,
        size: 20,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    });
    expect(page.items[0]).toEqual({
      eventType: 'ADVANCED',
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
      fromBusinessDate: '04-09-2026',
      toBusinessDate: '07-09-2026',
      actorUserId: 'u1',
      reason: null,
      occurredAt: '2026-09-07T05:00:00Z',
    });
  });
});
```

`business-date-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { availableBusinessDateActions, historyEventLabel } from './business-date-rules';

const ALL = [
  'business_date.view',
  'business_date.advance',
  'business_date.reopen',
  'cob.start',
  'cob.complete',
];

describe('business date rules', () => {
  it.each([
    ['OPEN', ['cob.start', 'business_date.advance']],
    ['CLOSING', ['cob.complete']],
    ['CLOSED', ['business_date.reopen']],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBusinessDateActions(status, { permissions: ALL })).toEqual(expected);
  });

  it('needs each action permission and business_date.view (BG-31)', () => {
    expect(
      availableBusinessDateActions('OPEN', { permissions: ['business_date.view', 'cob.start'] }),
    ).toEqual(['cob.start']);
    expect(
      availableBusinessDateActions('OPEN', { permissions: ['cob.start', 'business_date.advance'] }),
    ).toEqual([]);
  });

  it('labels history events, falling back readably', () => {
    expect(historyEventLabel('COB_STARTED')).toBe('Close of business started');
    expect(historyEventLabel('SOMETHING_NEW')).toBe('Something new');
  });
});
```

`business-date-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const apiPost = vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
  Promise.resolve({}),
);
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// Pass-through: this test covers each action's fields and body; runServerAction has its own test.
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: async (
    schema: z.ZodType,
    formData: FormData,
    run: (input: unknown) => Promise<unknown>,
  ) => {
    await run(schema.parse(Object.fromEntries(formData)));
    return { ok: true };
  },
}));

const actions = await import('./business-date-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('business date actions', () => {
  beforeEach(() => {
    apiPost.mockClear();
  });

  it.each([
    ['startCloseOfBusiness', '/api/v1/tenant/business-date/cob/start'],
    ['completeCloseOfBusiness', '/api/v1/tenant/business-date/cob/complete'],
    ['reopenBusinessDate', '/api/v1/tenant/business-date/reopen'],
  ] as const)('%s posts {} or {reason} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, reason: '   ' }));
    expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);

    await actions[name](null, form({ idempotencyKey: KEY, reason: ' End of day ' }));
    expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'End of day' }, KEY);
  });

  it('advances with the converted date, snake_case only', async () => {
    await actions.advanceBusinessDate(
      null,
      form({ idempotencyKey: KEY, newBusinessDate: '2026-09-08', reason: '' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/business-date/advance',
      { new_business_date: '08-09-2026' },
      KEY,
    );
  });

  it('refuses an impossible date or a missing key before calling the backend', async () => {
    await expect(
      actions.advanceBusinessDate(
        null,
        form({ idempotencyKey: KEY, newBusinessDate: '2026-02-30' }),
      ),
    ).rejects.toThrow();
    await expect(actions.startCloseOfBusiness(null, form({ reason: 'x' }))).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm test:run modules/administration/business-date` → FAIL.

- [ ] **Step 2: Implement the contract and service**

`business-date-contract.ts`:

```ts
import { z } from 'zod';
import { businessDateSchema, instantSchema, pageSchema } from '@/lib/api/wire';

export const BUSINESS_DATE_STATUSES = ['OPEN', 'CLOSING', 'CLOSED'] as const;
export type BusinessDateStatus = (typeof BUSINESS_DATE_STATUSES)[number];

export const currentBusinessDateSchema = z
  .object({
    organisation_id: z.string(),
    current_business_date: businessDateSchema,
    status: z.enum(BUSINESS_DATE_STATUSES),
  })
  .transform((value) => ({ date: value.current_business_date, status: value.status }));

export type CurrentBusinessDate = z.output<typeof currentBusinessDateSchema>;

const historyEntrySchema = z
  .object({
    event_type: z.string(),
    from_status: z.string().nullable(),
    to_status: z.string(),
    from_business_date: businessDateSchema.nullable(),
    to_business_date: businessDateSchema,
    actor_id: z.string().nullable(),
    reason: z.string().nullable(),
    occurred_at: instantSchema,
  })
  .transform((entry) => ({
    eventType: entry.event_type,
    fromStatus: entry.from_status,
    toStatus: entry.to_status,
    fromBusinessDate: entry.from_business_date,
    toBusinessDate: entry.to_business_date,
    actorUserId: entry.actor_id,
    reason: entry.reason,
    occurredAt: entry.occurred_at,
  }));

export type BusinessDateHistoryEntry = z.output<typeof historyEntrySchema>;

export const businessDateHistoryPageSchema = pageSchema(historyEntrySchema);
```

`business-date-service.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { businessDateHistoryPageSchema, currentBusinessDateSchema } from './business-date-contract';

/** One read per request, shared by the page and the app-bar indicator. */
export const getBusinessDate = cache(() =>
  apiGet('/api/v1/tenant/business-date', currentBusinessDateSchema),
);

export function listBusinessDateHistory(paging: { page: number; size: number }) {
  return apiGet(
    `/api/v1/tenant/business-date/history${toQueryString(paging)}`,
    businessDateHistoryPageSchema,
  );
}
```

- [ ] **Step 3: Implement the rules and actions**

`business-date-rules.ts`:

```ts
import { can, type PermissionHolder } from '@/auth/permissions';
import { humanizeEnum } from '@/components/data-display/status-chip';
import type { BusinessDateStatus } from './business-date-contract';

/** Each action's id is also the permission that allows it. */
export type BusinessDateAction =
  'cob.start' | 'business_date.advance' | 'cob.complete' | 'business_date.reopen';

const ACTIONS_BY_STATUS: Record<BusinessDateStatus, readonly BusinessDateAction[]> = {
  OPEN: ['cob.start', 'business_date.advance'],
  CLOSING: ['cob.complete'],
  CLOSED: ['business_date.reopen'],
};

/** Mutations also need `business_date.view`: the backend reads the result back (BG-31). */
export function availableBusinessDateActions(
  status: BusinessDateStatus,
  holder: PermissionHolder,
): BusinessDateAction[] {
  if (!can(holder, 'business_date.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, action));
}

const EVENT_LABELS: Record<string, string> = {
  ADVANCED: 'Date advanced',
  COB_STARTED: 'Close of business started',
  COB_COMPLETED: 'Close of business completed',
  REOPENED: 'Reopened',
};

export function historyEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? humanizeEnum(eventType);
}
```

`business-date-actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { isoToBusinessDate } from '@/lib/business-date';

const BASE = '/api/v1/tenant/business-date';

const reason = z
  .string()
  .trim()
  .max(500, 'Keep the reason under 500 characters.')
  .optional()
  .transform((value) => value || null);

const transitionInput = z.object({ idempotencyKey: z.uuid(), reason });

const advanceInput = transitionInput.extend({
  newBusinessDate: z.string().transform((value, context) => {
    const date = isoToBusinessDate(value);
    if (!date) {
      context.addIssue({ code: 'custom', message: 'Choose a valid date.' });
      return z.NEVER;
    }
    return date;
  }),
});

// The backend requires a body on every transition; `reason` only when there is one (contract §D).
const reasonBody = (value: string | null) => (value ? { reason: value } : {});

function transition(path: string, formData: FormData): Promise<ActionResult> {
  return runServerAction(transitionInput, formData, (input) =>
    apiPost(`${BASE}${path}`, reasonBody(input.reason), input.idempotencyKey),
  );
}

export async function startCloseOfBusiness(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/cob/start', formData);
}

export async function completeCloseOfBusiness(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/cob/complete', formData);
}

export async function reopenBusinessDate(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transition('/reopen', formData);
}

export async function advanceBusinessDate(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runServerAction(advanceInput, formData, (input) =>
    apiPost(
      `${BASE}/advance`,
      { new_business_date: input.newBusinessDate, ...reasonBody(input.reason) },
      input.idempotencyKey,
    ),
  );
}
```

Run: `pnpm test:run modules/administration/business-date` → PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/administration/business-date
git commit -m "$(cat <<'EOF'
feat(business-date): add the business date contract, reads, transition rules, and Server Actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: The page, the app-bar indicator, and navigation

**Files:**

- Create: `app/(authenticated)/admin/business-date/page.tsx`
- Create (under `modules/administration/business-date/components/`): `business-date-actions.tsx`
  (client), `business-date-history-table.tsx` + test, `business-date-indicator.tsx` + test
- Modify: `components/shell/global-header.tsx` (+ test), `components/shell/app-shell.tsx`
- Modify: `app/(authenticated)/layout.tsx` (+ test)
- Modify: `modules/administration/administration-navigation.ts`

**Interfaces:**

- Consumes: Tasks 1–4; PR 05 `getCurrentContextProfile`, `useToast`
  (`components/providers/toast-provider.tsx`); PR 06 `load`, `parsePaging`, `toSearchParams`,
  `resolveUserNames`, `getOrganisationTimeZone`, `TablePaginationBar`, `EmptyState`, `ErrorState`,
  `StatusChip`, `TruncatedText`.
- Produces: `GlobalHeader` and `AppShell` gain `businessDate?: ReactNode`;
  `BusinessDateIndicator()` (async Server Component); `BusinessDateHistoryTable({ entries, actorNames,
timeZone })`; `BusinessDateActions({ actions, currentDate })`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (design-system command with `"business date close of
business operations"`).

- [ ] **Step 2: Write the failing component tests**

`business-date-history-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BusinessDateHistoryEntry } from '../business-date-contract';
import { BusinessDateHistoryTable } from './business-date-history-table';

const COMPLETED: BusinessDateHistoryEntry = {
  eventType: 'COB_COMPLETED',
  fromStatus: 'CLOSING',
  toStatus: 'CLOSED',
  fromBusinessDate: '07-09-2026',
  toBusinessDate: '07-09-2026',
  actorUserId: 'u1',
  reason: 'x'.repeat(300),
  occurredAt: '2026-09-07T15:00:00Z',
};

describe('BusinessDateHistoryTable', () => {
  it('shows each change with resolved actors and dense, untruncated-on-demand reasons', () => {
    renderWithProviders(
      <BusinessDateHistoryTable
        entries={[
          COMPLETED,
          {
            ...COMPLETED,
            eventType: 'ADVANCED',
            fromStatus: 'OPEN',
            toStatus: 'OPEN',
            fromBusinessDate: '04-09-2026',
            actorUserId: null,
            reason: null,
          },
        ]}
        actorNames={new Map([['u1', 'Grace Nduku']])}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Occurred (Africa/Nairobi)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Close of business completed')).toBeInTheDocument();
    expect(screen.getByText('Closing → Closed')).toBeInTheDocument();
    expect(screen.getByText('Fri, 4 Sep 2026 → Mon, 7 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Grace Nduku')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByTitle('x'.repeat(300))).toBeInTheDocument();
  });
});
```

`business-date-indicator.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const getBusinessDate = vi.fn();
vi.mock('../business-date-service', () => ({
  getBusinessDate: () => getBusinessDate() as unknown,
}));

const { BusinessDateIndicator } = await import('./business-date-indicator');

describe('BusinessDateIndicator', () => {
  beforeEach(() => {
    getBusinessDate.mockReset();
  });

  it('links the current date and status to the business date page', async () => {
    getBusinessDate.mockResolvedValueOnce({ date: '07-09-2026', status: 'OPEN' });
    renderWithProviders(<>{await BusinessDateIndicator()}</>);

    expect(
      screen.getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' }),
    ).toHaveAttribute('href', '/admin/business-date');
  });

  it('renders nothing when the read fails, so the shell survives', async () => {
    getBusinessDate.mockRejectedValueOnce(new Error('forbidden'));
    renderWithProviders(<>{await BusinessDateIndicator()}</>);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

Append to `components/shell/global-header.test.tsx` (reuse its `CONTEXT`/`USER` fixtures and render
wrapper):

```tsx
it('renders the business date slot', () => {
  renderWithProviders(
    <ApplicationContextProvider value={CONTEXT}>
      <GlobalHeader
        user={USER}
        platformOrganisationId="platform"
        onOpenNavigation={vi.fn()}
        onOpenContextSwitcher={vi.fn()}
        businessDate={<span>Business date slot</span>}
      />
    </ApplicationContextProvider>,
  );
  expect(screen.getByText('Business date slot')).toBeInTheDocument();
});
```

In `app/(authenticated)/layout.test.tsx`: make the hoisted `profileToFinaxisUser` mock also return
`permissions: (profile.permissions as string[] | undefined) ?? []`, mock the indicator module
(`vi.mock('@/modules/administration/business-date/components/business-date-indicator', () => ({
BusinessDateIndicator: () => null }))`), capture `businessDate` in the `AppShell` mock's
`renderedShell({ … })` call, and add:

```tsx
it.each([
  ['administration', ['business_date.view'], true],
  ['administration', [], false],
  ['platform-administration', ['business_date.view'], false],
])('module %s with %j shows the business date: %s', async (moduleId, permissions, shown) => {
  getAuthenticatedUser.mockResolvedValueOnce({
    id: 'user-1',
    name: 'Jane Muthoni',
    email: 'jane.muthoni@finaxis.test',
    roles: [],
    branches: [],
  });
  getCurrentContextProfile.mockResolvedValueOnce({
    kind: 'resolved',
    context: {
      branch: null,
      module: { id: moduleId, name: 'Workspace' },
      organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
    },
    profile: {
      user_id: 'u',
      full_name: 'Jane',
      email: 'j@x',
      branches: [],
      roles: [],
      permissions,
    },
  });

  render(await AuthenticatedLayout({ children: <div /> }));

  const props = renderedShell.mock.calls[0]?.[0] as { businessDate: unknown };
  expect(props.businessDate !== null).toBe(shown);
});
```

Run: `pnpm test:run modules/administration/business-date components/shell "app/(authenticated)/layout.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement the history table and the indicator**

`business-date-history-table.tsx`:

```tsx
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import type { BusinessDateHistoryEntry } from '../business-date-contract';
import { historyEventLabel } from '../business-date-rules';

interface BusinessDateHistoryTableProps {
  entries: readonly BusinessDateHistoryEntry[];
  actorNames: ReadonlyMap<string, string>;
  timeZone: string;
}

function change(from: string | null, to: string, format: (value: string) => string): string {
  return from && from !== to ? `${format(from)} → ${format(to)}` : format(to);
}

const shortDate = (value: string) => formatBusinessDate(value, 'short');

export function BusinessDateHistoryTable({
  entries,
  actorNames,
  timeZone,
}: BusinessDateHistoryTableProps) {
  return (
    <TableContainer>
      <Table aria-label="Business date history" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Occurred ({timeZone})</TableCell>
            <TableCell>Event</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Business date</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry, index) => {
            const when = formatInstant(entry.occurredAt, timeZone);
            return (
              // History entries have no id on the wire; they're immutable and newest first.
              <TableRow key={`${entry.occurredAt}-${index}`} hover>
                <TableCell>
                  <Typography variant="body2">{when.date}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {when.time}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {historyEventLabel(entry.eventType)}
                  </Typography>
                </TableCell>
                <TableCell>{change(entry.fromStatus, entry.toStatus, humanizeEnum)}</TableCell>
                <TableCell>
                  {change(entry.fromBusinessDate, entry.toBusinessDate, shortDate)}
                </TableCell>
                <TableCell>
                  {entry.actorUserId
                    ? (actorNames.get(entry.actorUserId) ?? shortId(entry.actorUserId))
                    : 'System'}
                </TableCell>
                <TableCell>
                  {entry.reason ? <TruncatedText value={entry.reason} maxWidth={280} /> : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`business-date-indicator.tsx`:

```tsx
import Chip from '@mui/material/Chip';
import EventOutlined from '@mui/icons-material/EventOutlined';
import NextLink from '@/components/navigation/next-link';
import { humanizeEnum, statusTone } from '@/components/data-display/status-chip';
import { formatBusinessDate } from '@/lib/format';
import { getBusinessDate } from '../business-date-service';

/** App-bar business date (spec §8). A failed read renders nothing, so the shell never breaks. */
export async function BusinessDateIndicator() {
  const current = await getBusinessDate().catch(() => null);
  if (!current) return null;
  return (
    <Chip
      component={NextLink}
      href="/admin/business-date"
      clickable
      size="small"
      variant="soft"
      color={statusTone(current.status)}
      icon={<EventOutlined />}
      label={`${formatBusinessDate(current.date, 'short')} · Business date · ${humanizeEnum(current.status)}`}
    />
  );
}
```

- [ ] **Step 4: Implement the client actions and the page**

`business-date-actions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import { nextBusinessDateIso } from '@/lib/business-date';
import {
  advanceBusinessDate,
  completeCloseOfBusiness,
  reopenBusinessDate,
  startCloseOfBusiness,
} from '../business-date-actions';
import type { BusinessDateAction } from '../business-date-rules';

const COPY: Record<
  BusinessDateAction,
  { label: string; title: string; description: string; success: string; action: FormAction }
> = {
  'cob.start': {
    label: 'Start close of business',
    title: 'Start close of business?',
    description: 'The business date moves to Closing until close of business is completed.',
    success: 'Close of business started',
    action: startCloseOfBusiness,
  },
  'business_date.advance': {
    label: 'Advance date',
    title: 'Advance the business date',
    description: 'Choose a later date. Skipping days is allowed; going back is not.',
    success: 'Business date advanced',
    action: advanceBusinessDate,
  },
  'cob.complete': {
    label: 'Complete close of business',
    title: 'Complete close of business?',
    description: 'The business date moves to Closed.',
    success: 'Close of business completed',
    action: completeCloseOfBusiness,
  },
  'business_date.reopen': {
    label: 'Reopen',
    title: 'Reopen the business date?',
    description: 'The same date returns to Open.',
    success: 'Business date reopened',
    action: reopenBusinessDate,
  },
};

interface BusinessDateActionsProps {
  actions: readonly BusinessDateAction[];
  currentDate: string;
}

export function BusinessDateActions({ actions, currentDate }: BusinessDateActionsProps) {
  const notify = useToast();
  const [openAction, setOpenAction] = useState<BusinessDateAction | null>(null);
  const minDate = nextBusinessDateIso(currentDate) ?? undefined;

  return (
    <>
      {actions.map((id, index) => (
        <Button
          key={id}
          variant={index === 0 ? 'contained' : 'outlined'}
          onClick={() => {
            setOpenAction(id);
          }}
        >
          {COPY[id].label}
        </Button>
      ))}
      {actions.map((id) => (
        <ReasonDialog
          key={id}
          open={openAction === id}
          title={COPY[id].title}
          description={COPY[id].description}
          confirmLabel={COPY[id].label}
          reason="optional"
          action={COPY[id].action}
          onClose={() => {
            setOpenAction(null);
          }}
          onSuccess={() => {
            setOpenAction(null);
            notify(COPY[id].success, 'success');
          }}
          fields={
            id === 'business_date.advance'
              ? (fieldErrors) => (
                  <TextField
                    name="newBusinessDate"
                    type="date"
                    label="New business date"
                    required
                    error={Boolean(fieldErrors.newBusinessDate)}
                    helperText={
                      fieldErrors.newBusinessDate ?? 'Must be after the current business date.'
                    }
                    slotProps={{ htmlInput: { min: minDate } }}
                  />
                )
              : undefined
          }
        />
      ))}
    </>
  );
}
```

`app/(authenticated)/admin/business-date/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EventOutlined from '@mui/icons-material/EventOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { parsePaging } from '@/lib/api/paging';
import { toSearchParams } from '@/lib/api/query-string';
import { formatBusinessDate } from '@/lib/format';
import { availableBusinessDateActions } from '@/modules/administration/business-date/business-date-rules';
import {
  getBusinessDate,
  listBusinessDateHistory,
} from '@/modules/administration/business-date/business-date-service';
import { BusinessDateActions } from '@/modules/administration/business-date/components/business-date-actions';
import { BusinessDateHistoryTable } from '@/modules/administration/business-date/components/business-date-history-table';

export const metadata: Metadata = { title: 'Business date' };

const HISTORY_PAGE_SIZE = 20;

interface BusinessDatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BusinessDatePage({ searchParams }: BusinessDatePageProps) {
  const paging = parsePaging(toSearchParams(await searchParams), HISTORY_PAGE_SIZE);
  const [current, history, selected, timeZone] = await Promise.all([
    load(getBusinessDate()),
    load(listBusinessDateHistory(paging)),
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];
  const actorNames = history.ok
    ? await resolveUserNames(
        history.value.items.flatMap((entry) => (entry.actorUserId ? [entry.actorUserId] : [])),
      )
    : new Map<string, string>();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Business date"
        description="The institution's operating date and its close-of-business cycle."
      />
      <Stack spacing={5}>
        {current.ok ? (
          <SectionCard
            title="Current business date"
            actions={
              <BusinessDateActions
                actions={availableBusinessDateActions(current.value.status, { permissions })}
                currentDate={current.value.date}
              />
            }
          >
            <Box
              sx={{ px: 4, py: 5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}
            >
              <EventOutlined color="primary" aria-hidden="true" />
              <Typography component="p" variant="h3">
                {formatBusinessDate(current.value.date, 'long')}
              </Typography>
              <StatusChip value={current.value.status} />
            </Box>
          </SectionCard>
        ) : (
          <Paper>
            <ErrorState problem={current.problem} />
          </Paper>
        )}
        <SectionCard
          title="History"
          description="Every advance and close-of-business step, newest first."
        >
          {!history.ok ? (
            <ErrorState problem={history.problem} />
          ) : history.value.items.length === 0 ? (
            <EmptyState
              title="No business date changes yet"
              description="Advances and close-of-business steps appear here."
            />
          ) : (
            <>
              <BusinessDateHistoryTable
                entries={history.value.items}
                actorNames={actorNames}
                timeZone={timeZone}
              />
              <TablePaginationBar page={history.value.page} />
            </>
          )}
        </SectionCard>
      </Stack>
    </>
  );
}
```

- [ ] **Step 5: Wire the shell and navigation**

`components/shell/global-header.tsx`: import `type ReactNode`, add `businessDate?: ReactNode` to the
props, and directly after the flexible spacer (`<Box sx={{ flexGrow: 1 }} />`) render:

```tsx
{
  businessDate && <Box sx={{ display: { xs: 'none', lg: 'flex' } }}>{businessDate}</Box>;
}
```

`components/shell/app-shell.tsx`: add `businessDate?: ReactNode` to `AppShellProps` and pass
`businessDate={businessDate}` to `GlobalHeader`.

`app/(authenticated)/layout.tsx`: import `Suspense` from `react`, `can` from `@/auth/permissions`,
`platformAdministrationModule` from `@/modules/platform-administration/platform-administration-module`,
and `BusinessDateIndicator`; build the user once and pass the slot:

```tsx
const user = profileToFinaxisUser(selectedContext.profile, sessionUser);
// Tenant contexts only: the platform context can't call tenant routes (spec §11).
const showBusinessDate =
  selectedContext.context.module.id !== platformAdministrationModule.id &&
  can(user, 'business_date.view');
```

```tsx
    <AppShell
      user={user}
      businessDate={
        showBusinessDate ? (
          <Suspense fallback={null}>
            <BusinessDateIndicator />
          </Suspense>
        ) : null
      }
      …the existing props…
    >
```

`modules/administration/administration-navigation.ts`: import `EventOutlined` and insert before the
Audit trail entry (spec §8 order):

```ts
  {
    href: '/admin/business-date',
    label: 'Business date',
    icon: EventOutlined,
    requiresAny: ['business_date.view'],
  },
```

- [ ] **Step 6: Run and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add -A "app/(authenticated)" components/shell modules/administration
git commit -m "$(cat <<'EOF'
feat(business-date): add the business date page, history, actions, and the app-bar indicator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Fake API business date, idempotency, E2E, live checks

**Files:**

- Modify: `e2e/fake-api/state.mts`, `e2e/fake-api/scenarios.mts`, `e2e/fake-api/server.mts`
- Create: `e2e/fake-api/idempotency.mts`, `e2e/fake-api/routes/business-date.mts`
- Modify: `e2e/fake-api.spec.ts`, `e2e/support/auth.ts`
- Create: `e2e/business-date.spec.ts`

- [ ] **Step 1: Extend the fake state and scenarios**

`state.mts` — add, and include the four new fields in `RunState`:

```ts
export interface FakeBusinessDate {
  organisationId: string;
  date: string;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
}

export interface FakeBusinessDateEvent {
  organisationId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string;
  fromDate: string | null;
  toDate: string;
  actorUserId: string | null;
  reason: string | null;
  occurredAt: string;
}
```

```ts
  businessDates: FakeBusinessDate[];
  /** Newest first, like the API. */
  businessDateHistory: FakeBusinessDateEvent[];
  /** Idempotency-Key → the successful response it replays. */
  idempotency: Map<string, { fingerprint: string; body: unknown }>;
  /** Mutations that fail with a lock timeout before one succeeds. */
  lockTimeoutsRemaining: number;
```

`scenarios.mts` — add the four codes TENANT_ADMIN holds in the real seed (contract §J) to
`TENANT_ADMIN_PERMISSIONS`: `'business_date.advance'`, `'business_date.reopen'`, `'cob.start'`,
`'cob.complete'`. Add `FakeBusinessDateEvent` to the type imports and, above `greenfieldTenant()`:

```ts
function seedBusinessDateHistory(): FakeBusinessDateEvent[] {
  const base = { organisationId: IDS.greenfield, actorUserId: IDS.jane, reason: null };
  return [
    {
      ...base,
      eventType: 'ADVANCED',
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
      fromDate: '04-09-2026',
      toDate: '07-09-2026',
      occurredAt: '2026-09-07T05:00:00Z',
      reason: 'Weekend',
    },
    {
      ...base,
      eventType: 'REOPENED',
      fromStatus: 'CLOSED',
      toStatus: 'OPEN',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-07T04:58:00Z',
    },
    {
      ...base,
      eventType: 'COB_COMPLETED',
      fromStatus: 'CLOSING',
      toStatus: 'CLOSED',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-04T18:30:00Z',
    },
    {
      ...base,
      eventType: 'COB_STARTED',
      fromStatus: 'OPEN',
      toStatus: 'CLOSING',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-04T18:00:00Z',
      reason: 'End of day',
    },
  ];
}
```

In `greenfieldTenant()` add:

```ts
    businessDates: [{ organisationId: IDS.greenfield, date: '07-09-2026', status: 'OPEN' }],
    businessDateHistory: seedBusinessDateHistory(),
    idempotency: new Map(),
    lockTimeoutsRemaining: 0,
```

In `platformOperator()` add `businessDates: [], businessDateHistory: [], idempotency: new Map(),
lockTimeoutsRemaining: 0,`. Register in `BUILDERS`:

```ts
  'business-date-read-only': () =>
    withoutPermission(greenfieldTenant(), 'business_date.advance', 'business_date.reopen', 'cob.start', 'cob.complete'),
  'business-date-busy': () => ({ ...greenfieldTenant(), lockTimeoutsRemaining: 1 }),
```

and add both names to `FakeApiScenario` in `e2e/support/auth.ts`.

- [ ] **Step 2: Implement idempotency and the routes**

`e2e/fake-api/idempotency.mts`:

```ts
import { problem, sendJson } from './http.mts';
import type { RouteContext } from './router.mts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mirrors the backend's Idempotency-Key handling (contract §A): a success replays for the same key;
 * the same key with a different method, path, or body → 409 IDEMPOTENCY_KEY_REUSED; a failure
 * (`produce` throws) stores nothing, so retrying with the same key is safe.
 */
export function sendIdempotent(context: RouteContext, body: unknown, produce: () => unknown): void {
  const header = context.req.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (key === undefined) {
    sendJson(context.res, 200, produce());
    return;
  }
  if (!UUID.test(key)) {
    throw problem(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.');
  }
  const fingerprint = `${context.req.method ?? ''} ${context.path} ${JSON.stringify(body)}`;
  const stored = context.state.idempotency.get(key);
  if (stored) {
    if (stored.fingerprint !== fingerprint) {
      throw problem(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was used for a different request.',
      );
    }
    sendJson(context.res, 200, stored.body, {
      'Idempotency-Key': key,
      'Idempotency-Replayed': 'true',
    });
    return;
  }
  const response = produce();
  context.state.idempotency.set(key, { fingerprint, body: response });
  sendJson(context.res, 200, response, { 'Idempotency-Key': key });
}
```

`e2e/fake-api/routes/business-date.mts`:

```ts
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeBusinessDate, RunState } from '../state.mts';

const BASE = '/api/v1/tenant/business-date';
const DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Strict dd-MM-yyyy → day number (the backend's date codec), or null. */
function dayNumber(value: string): number | null {
  const match = DATE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCDate() === day &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCFullYear() === year
    ? time / 86_400_000
    : null;
}

function viewer(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  requirePermission(access, 'business_date.view');
  return access;
}

function currentFor(state: RunState, access: AccessContext): FakeBusinessDate {
  const record = state.businessDates.find(
    (candidate) => candidate.organisationId === access.organisation.id,
  );
  if (!record) {
    throw problem(404, 'resource_not_found', 'Business date not found.');
  }
  return record;
}

function takeLock(state: RunState): void {
  if (state.lockTimeoutsRemaining > 0) {
    state.lockTimeoutsRemaining -= 1;
    throw problem(
      409,
      'lifecycle.business_date_lock_timeout',
      'Timed out waiting for the business date lock.',
    );
  }
}

const toWire = (record: FakeBusinessDate) => ({
  organisation_id: record.organisationId,
  current_business_date: record.date,
  status: record.status,
});

function transition(
  path: string,
  permission: string,
  from: FakeBusinessDate['status'],
  to: FakeBusinessDate['status'],
  eventType: string,
): Route {
  return route('POST', `${BASE}${path}`, async (context) => {
    const access = viewer(context);
    requirePermission(access, permission);
    const body = objectBody(await readBody(context.req), ['reason']);
    const reason = stringField(body, 'reason', { required: false });
    sendIdempotent(context, body, () => {
      const record = currentFor(context.state, access);
      takeLock(context.state);
      if (record.status !== from) {
        throw problem(409, 'conflict', `The business date must be ${from}.`);
      }
      record.status = to;
      context.state.businessDateHistory.unshift({
        organisationId: record.organisationId,
        eventType,
        fromStatus: from,
        toStatus: to,
        fromDate: record.date,
        toDate: record.date,
        actorUserId: access.claims.userId,
        reason,
        occurredAt: new Date().toISOString(),
      });
      return toWire(record);
    });
  });
}

export const businessDateRoutes: Route[] = [
  route('GET', BASE, (context) => {
    const access = viewer(context);
    sendJson(context.res, 200, toWire(currentFor(context.state, access)));
  }),

  route('GET', `${BASE}/history`, (context) => {
    const access = viewer(context);
    const entries = context.state.businessDateHistory
      .filter((entry) => entry.organisationId === access.organisation.id)
      .map((entry) => ({
        event_type: entry.eventType,
        from_status: entry.fromStatus,
        to_status: entry.toStatus,
        from_business_date: entry.fromDate,
        to_business_date: entry.toDate,
        actor_id: entry.actorUserId,
        reason: entry.reason,
        occurred_at: entry.occurredAt,
      }));
    sendJson(context.res, 200, pageOf(entries, context.query));
  }),

  transition('/cob/start', 'cob.start', 'OPEN', 'CLOSING', 'COB_STARTED'),
  transition('/cob/complete', 'cob.complete', 'CLOSING', 'CLOSED', 'COB_COMPLETED'),
  transition('/reopen', 'business_date.reopen', 'CLOSED', 'OPEN', 'REOPENED'),

  route('POST', `${BASE}/advance`, async (context) => {
    const access = viewer(context);
    requirePermission(access, 'business_date.advance');
    const body = objectBody(await readBody(context.req), ['new_business_date', 'reason']);
    const next = stringField(body, 'new_business_date', { required: true }) ?? '';
    const reason = stringField(body, 'reason', { required: false });
    const nextDay = dayNumber(next);
    if (nextDay === null) {
      throw problem(400, 'invalid_json', 'new_business_date must be dd-MM-yyyy.');
    }
    sendIdempotent(context, body, () => {
      const record = currentFor(context.state, access);
      takeLock(context.state);
      if (record.status !== 'OPEN') {
        throw problem(409, 'conflict', 'The business date must be OPEN to advance.');
      }
      if (nextDay <= (dayNumber(record.date) ?? Number.MAX_SAFE_INTEGER)) {
        throw problem(
          422,
          'invalid_operation',
          'The new business date must be after the current one.',
        );
      }
      const previous = record.date;
      record.date = next;
      context.state.businessDateHistory.unshift({
        organisationId: record.organisationId,
        eventType: 'ADVANCED',
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        fromDate: previous,
        toDate: next,
        actorUserId: access.claims.userId,
        reason,
        occurredAt: new Date().toISOString(),
      });
      return {
        organisation_id: record.organisationId,
        previous_business_date: previous,
        new_business_date: next,
      };
    });
  }),
];
```

Register `...businessDateRoutes` in `server.mts`.

- [ ] **Step 3: Pin the fake's idempotency in `e2e/fake-api.spec.ts`**

Add inside `test.describe('fake API')`:

```ts
test('replays a success for the same Idempotency-Key and rejects a changed body', async ({
  request,
}) => {
  const headers = bearer();
  const selection = await request.post(`${FAKE_API_URL}/api/v1/auth/select-organisation`, {
    headers,
    data: { organisation_id: '11111111-1111-4111-8111-111111111111' },
  });
  const { context_token: contextToken } = (await selection.json()) as { context_token: string };
  const key = randomUUID();
  const send = (data: Record<string, unknown>) =>
    request.post(`${FAKE_API_URL}/api/v1/tenant/business-date/cob/start`, {
      headers: {
        ...headers,
        'X-Active-Organisation-Context': contextToken,
        'Idempotency-Key': key,
      },
      data,
    });

  const first = await send({ reason: 'End of day' });
  const replay = await send({ reason: 'End of day' });
  const changed = await send({ reason: 'Something else' });

  expect(first.status()).toBe(200);
  expect(replay.headers()['idempotency-replayed']).toBe('true');
  expect(await replay.json()).toEqual(await first.json());
  expect(changed.status()).toBe(409);
  expect(await changed.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});
```

- [ ] **Step 4: Write `e2e/business-date.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

async function enter(page: Page) {
  await page.goto('/admin/business-date');
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
  await expect(page.getByRole('heading', { level: 1, name: 'Business date' })).toBeVisible();
}

const hero = (page: Page) => page.getByRole('region', { name: 'Current business date' });
const historyRows = (page: Page) =>
  page.getByRole('table', { name: 'Business date history' }).getByRole('row');

async function run(page: Page, action: string, reason?: string) {
  await hero(page).getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill(reason);
  await dialog.getByRole('button', { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('business date', () => {
  test('shows the date, status, history, and the app-bar indicator', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await expect(hero(page).getByText('Monday, 7 September 2026')).toBeVisible();
    await expect(hero(page).getByText('Open', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(5); // header + 4
    await expect(
      page
        .getByRole('banner')
        .getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' }),
    ).toBeVisible();
  });

  test('runs close of business and reopens, each with a fresh request', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await run(page, 'Start close of business', 'End of day');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Close of business started' }),
    ).toBeVisible();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    await expect(historyRows(page).nth(1)).toContainText('Close of business started');
    await expect(historyRows(page).nth(1)).toContainText('End of day');

    await run(page, 'Complete close of business');
    await expect(hero(page).getByText('Closed', { exact: true })).toBeVisible();
    await run(page, 'Reopen');
    await expect(hero(page).getByText('Open', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(8);
  });

  test('advances to a later date and updates the app bar', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await hero(page).getByRole('button', { name: 'Advance date', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Advance the business date' });
    await expect(dialog.getByLabel('New business date')).toHaveAttribute('min', '2026-09-08');
    await dialog.getByLabel('New business date').fill('2026-09-08');
    await dialog.getByRole('button', { name: 'Advance date', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(hero(page).getByText('Tuesday, 8 September 2026')).toBeVisible();
    await expect(
      page.getByRole('banner').getByRole('link', { name: /Tue, 8 Sep 2026/ }),
    ).toBeVisible();
  });

  test('retries a busy lock with the same request and records one change', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-busy');
    await enter(page);

    await hero(page).getByRole('button', { name: 'Start close of business', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Another business date change is in progress',
    );

    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(6);
  });

  test('hides actions without the mutation permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-read-only');
    await enter(page);

    await expect(hero(page).getByText('Monday, 7 September 2026')).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
  });

  test('has no serious a11y violations (light, dark, dialog open, mobile)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);
    const serious = async () =>
      (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      );

    expect(await serious()).toEqual([]);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await serious()).toEqual([]);
    await hero(page).getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await serious()).toEqual([]);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 5: Gates**

```bash
pnpm exec prettier --write e2e
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. Run the ui-ux-pro-max checklist on `/admin/business-date` and the open dialogs
(light/dark, 1440/375).

- [ ] **Step 6: Live checks (with the user)**

Reads (the user signed in, local app → dev): `/admin/business-date` shows dev's date, status, and
history (or the empty state); the app bar shows the chip; history actors resolve; times use the
organisation's timezone.

Mutations — **ask before each one** and run only on the dev tenant the user names: Start close of
business → Complete close of business → Reopen, confirming each toast, status, and history row. This
returns the tenant to OPEN on the same date. Do **not** advance the dev date unless the user
explicitly approves moving it forward.

- [ ] **Step 7: Commit**

```bash
git add e2e
git commit -m "$(cat <<'EOF'
test(e2e): cover the business date cycle, advance, lock-timeout retry, gating, idempotency, and a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
