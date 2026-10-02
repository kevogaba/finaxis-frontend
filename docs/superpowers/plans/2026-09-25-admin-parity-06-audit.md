# PR 06: Audit Trail and Shared List Building Blocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Ship `/admin/audit` — a dense, filterable, paginated audit trail with an event detail
drawer — and, with it, the shared building blocks every later list and record page reuses.

**Architecture:** Generic wire helpers (`lib/api/wire.ts`), a context-aware GET helper
(`lib/api/tenant-api.ts`), problem → UI mapping (`lib/api/problem.ts`, `lib/api/load.ts`), and
`cache()`d name lookups (`lib/api/lookups.ts`). The audit domain lives in `modules/administration/audit/`
(contract, vocabulary, query, service, components). The page is a Server Component; filters, pagination,
and the drawer are small client components that only change the URL.

**Tech Stack:** Next.js 16 Server Components, React `cache`, zod 4, MUI 9 (`Table`,
`TablePagination`, `Drawer`, `Chip` soft variant, `Select`, `TextField type="datetime-local"`), Vitest,
Playwright.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §6.2–6.3, §6.7, §9,
§10.1; contract §C (`AuditEventSummary`, `AuditEventDetail`), §E.3 (audit, users, branches, tenant),
§G (vocabulary).

## Global Constraints

See the index. Additionally:

- The audit API has no free-text, outcome, severity, branch, or event-type filters — do not add UI
  for them (spec D7). Actor filtering is reachable by clicking an actor, not by a search box.
- Date filters are entered in the browser's local time and stored in the URL as ISO instants.
- Names are resolved only for IDs on the visible page (≤ page size lookups, deduplicated).
- **Live read check:** list, filters, pagination, and detail against dev (Task 6).

## Review Focus

Pins index items 1 (stale context from a page's service → reselection; Task 1 `load.test.ts`),
4 (long values; Task 5), and 5 (schema drift → error state with reference; Task 1
`problem.test.ts`, Task 3 `audit-contract.test.ts`).

---

### Task 1: Wire helpers, problem mapping, and loaders

**Files:**

- Create: `lib/api/wire.ts`, `lib/api/wire.test.ts`
- Create: `lib/api/query-string.ts` (moved from platform queries), `lib/api/query-string.test.ts`
- Create: `lib/api/paging.ts` (dependency-free, so client components can import it)
- Modify: `modules/platform-administration/platform-administration-queries.ts` (re-export
  `toQueryString` from `@/lib/api/query-string`)
- Create: `lib/api/tenant-api.ts`
- Create: `lib/api/problem.ts`, `lib/api/problem.test.ts`
- Create: `lib/api/load.ts`, `lib/api/load.test.ts`

**Interfaces:**

- Produces:
  - `wire.ts`: `UUID_PATTERN`, `uuidSchema`, `instantSchema`, `pageMetadataSchema`, `type
PageMetadata = { number, size, totalItems, totalPages, hasNext, hasPrevious }`, `interface
Page<T> { items: readonly T[]; page: PageMetadata }`, `pageSchema(itemSchema)`.
  - `query-string.ts`: `toQueryString(query: Record<string, string | number | undefined>): string`,
    `toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams` (a page's
    awaited `searchParams` → `URLSearchParams`, first value wins, empty values dropped).
  - `paging.ts`: `PAGE_SIZES = [10, 20, 30, 40, 50] as const`, `parsePaging(params: URLSearchParams,
defaultSize: number): { page: number; size: number }` (invalid → page 0 / `defaultSize`).
  - `tenant-api.ts` (server-only): `apiGet<S extends z.ZodType>(path: string, schema: S):
Promise<z.output<S>>` — reads `headers()` + the context cookie; a missing token throws
    `BackendApiError(403, { code: 'invalid_active_tenant_context' })`.
  - `problem.ts` (server-only): `interface ProblemView { title: string; message: string; code:
string | null; requestId: string | null }`, `describeProblem(error: unknown): ProblemView`.
  - `load.ts` (server-only): `type Loaded<T> = { ok: true; value: T } | { ok: false; problem:
ProblemView }`, `load<T>(promise: Promise<T>): Promise<Loaded<T>>` — redirects on 401 and stale
    context, otherwise returns a problem view; `redirectIfSessionLost(error: unknown, requestHeaders:
Headers): void` (the shared redirect rule; PR 07's Server Actions reuse it).

- [ ] **Step 1: Write the failing wire test**

`lib/api/wire.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from './wire';

const envelope = {
  items: [{ id: 'a' }],
  page: {
    number: 1,
    size: 20,
    total_items: 41,
    total_pages: 3,
    has_next: true,
    has_previous: true,
  },
};

describe('wire helpers', () => {
  it('maps the snake_case page envelope to camelCase and keeps items typed', () => {
    const parsed = pageSchema(z.object({ id: z.string() })).parse(envelope);

    expect(parsed).toEqual({
      items: [{ id: 'a' }],
      page: {
        number: 1,
        size: 20,
        totalItems: 41,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      },
    });
  });

  it('ignores extra fields and rejects missing page metadata', () => {
    const schema = pageSchema(z.object({ id: z.string() }));
    expect(schema.safeParse({ ...envelope, extra: true }).success).toBe(true);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });

  it('accepts canonical UUIDs (including the reserved nil UUID) and ISO instants', () => {
    expect(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(instantSchema.safeParse('2026-07-21T10:15:30Z').success).toBe(true);
    expect(instantSchema.safeParse('2026-07-21T10:15:30.123456Z').success).toBe(true);
    expect(instantSchema.safeParse('21-07-2026').success).toBe(false);
  });
});
```

Run `pnpm test:run lib/api/wire.test.ts` → FAIL.

- [ ] **Step 2: Implement `lib/api/wire.ts`**

```ts
import { z } from 'zod';

/**
 * Shared wire primitives for backend responses (contract §A–§B). Domain contracts compose these
 * with snake_case item schemas that transform to camelCase domain types.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_PATTERN);

/** ISO-8601 UTC instants (`…Z`, fractional seconds only when non-zero). */
export const instantSchema = z.iso.datetime({ offset: true });

export const pageMetadataSchema = z
  .object({
    number: z.number().int(),
    size: z.number().int(),
    total_items: z.number().int(),
    total_pages: z.number().int(),
    has_next: z.boolean(),
    has_previous: z.boolean(),
  })
  .transform((page) => ({
    number: page.number,
    size: page.size,
    totalItems: page.total_items,
    totalPages: page.total_pages,
    hasNext: page.has_next,
    hasPrevious: page.has_previous,
  }));

export type PageMetadata = z.output<typeof pageMetadataSchema>;

export interface Page<T> {
  items: readonly T[];
  page: PageMetadata;
}

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), page: pageMetadataSchema });
}
```

Run → PASS.

- [ ] **Step 3: Move `toQueryString` and add the paging helper**

Create `lib/api/query-string.ts` with the exact body of `toQueryString` and `queryFromParams` from
`modules/platform-administration/platform-administration-queries.ts`; in that file delete both
functions and add `export { toQueryString } from '@/lib/api/query-string';`.

`lib/api/paging.ts` (no imports — `TablePaginationBar` is a client component and must not pull zod
into the browser bundle; a server module must not import constants from a `'use client'` file):

```ts
/** Rows-per-page options for every list (spec §6.2). Any other `size` falls back to the default. */
export const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

export function parsePaging(
  params: URLSearchParams,
  defaultSize: number,
): { page: number; size: number } {
  const page = Number(params.get('page') ?? '0');
  const size = Number(params.get('size') ?? String(defaultSize));
  return {
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultSize,
  };
}
```

(Covered by `audit-query.test.ts` in Task 3.)

`lib/api/query-string.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toQueryString, toSearchParams } from './query-string';

describe('toQueryString', () => {
  it('drops undefined and empty values and encodes the rest', () => {
    expect(toQueryString({ q: 'a b', status: undefined, page: 0, empty: '' })).toBe(
      '?q=a+b&page=0',
    );
  });

  it('returns an empty string when nothing remains', () => {
    expect(toQueryString({ q: undefined })).toBe('');
  });
});

describe('toSearchParams', () => {
  it('keeps the first value of repeated params and drops empty ones', () => {
    expect(
      toSearchParams({ page: '2', status: ['ACTIVE', 'DRAFT'], q: '', size: undefined }).toString(),
    ).toBe('page=2&status=ACTIVE');
  });
});
```

Append to `lib/api/query-string.ts`:

```ts
/** A page's awaited `searchParams` as `URLSearchParams` (first value wins; empty values dropped). */
export function toSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(record).forEach(([key, value]) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  });
  return params;
}
```

Run `pnpm test:run lib/api modules/platform-administration` → PASS.

- [ ] **Step 4: Implement `lib/api/tenant-api.ts`**

```ts
import 'server-only';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { BackendApiError, backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';

/**
 * GET a context-scoped backend resource and validate it. A missing context token is treated like a
 * stale context so pages send the user back through context selection (lib/api/load.ts).
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const requestHeaders = await headers();
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    throw new BackendApiError(403, { code: 'invalid_active_tenant_context' });
  }
  return schema.parse(await backendApi.get<unknown>(path, requestHeaders, contextToken));
}
```

- [ ] **Step 5: Write the failing problem and load tests**

`lib/api/problem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { describeProblem } from './problem';

describe('describeProblem', () => {
  it.each([
    [403, 'Access denied'],
    [404, 'Not found'],
    [409, 'This changed'],
    [422, 'Check the details'],
    [429, 'Too many requests'],
    [500, 'Something went wrong'],
    [502, 'Something went wrong'],
  ])('maps HTTP %i to a safe title', (status, title) => {
    expect(describeProblem(new BackendApiError(status)).title).toBe(title);
  });

  it('keeps the backend request id as a support reference', () => {
    const view = describeProblem(
      new BackendApiError(500, { requestId: 'req-9', code: 'internal_error' }),
    );
    expect(view).toMatchObject({ requestId: 'req-9', code: 'internal_error' });
  });

  it('explains a response that no longer matches the contract (schema drift)', () => {
    const result = z.object({ id: z.string() }).safeParse({});
    if (result.success) throw new Error('expected a parse failure');

    expect(describeProblem(result.error)).toMatchObject({
      title: 'Something went wrong',
      message: expect.stringMatching(/couldn.t read/i) as unknown as string,
    });
  });

  it('never exposes an arbitrary error message', () => {
    expect(describeProblem(new Error('secret stack detail')).message).not.toContain('secret');
  });
});
```

`lib/api/load.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ 'x-finaxis-pathname': '/admin/audit' }))),
}));

const { load } = await import('./load');

describe('load', () => {
  it('returns the value on success', async () => {
    await expect(load(Promise.resolve(42))).resolves.toEqual({ ok: true, value: 42 });
  });

  it('sends a stale or missing context back through context selection', async () => {
    await expect(
      load(Promise.reject(new BackendApiError(403, { code: 'invalid_active_tenant_context' }))),
    ).rejects.toThrow('NEXT_REDIRECT:/select-context?next=%2Fadmin%2Faudit');
  });

  it('sends an expired session to login', async () => {
    await expect(load(Promise.reject(new BackendApiError(401)))).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );
  });

  it('returns a problem view for other failures', async () => {
    await expect(
      load(Promise.reject(new BackendApiError(403, { code: 'forbidden' }))),
    ).resolves.toMatchObject({
      ok: false,
      problem: { title: 'Access denied' },
    });
  });
});
```

Run `pnpm test:run lib/api` → FAIL.

- [ ] **Step 6: Implement `lib/api/problem.ts` and `lib/api/load.ts`**

`lib/api/problem.ts`:

```ts
import 'server-only';
import { ZodError } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

export interface ProblemView {
  title: string;
  message: string;
  code: string | null;
  requestId: string | null;
}

const BY_STATUS: Record<number, Pick<ProblemView, 'title' | 'message'>> = {
  400: {
    title: 'Check the details',
    message: "Some details weren't accepted. Review them and try again.",
  },
  403: {
    title: 'Access denied',
    message:
      "You don't have permission for this in your current context. Ask an administrator if you need access.",
  },
  404: {
    title: 'Not found',
    message: "This record doesn't exist or isn't available in your current context.",
  },
  409: {
    title: 'This changed',
    message: "The record changed or is in a state that doesn't allow this. Refresh and try again.",
  },
  422: {
    title: 'Check the details',
    message: "Some details weren't accepted. Review them and try again.",
  },
  429: { title: 'Too many requests', message: 'Please wait a moment and try again.' },
};

const GENERIC = {
  title: 'Something went wrong',
  message: "The platform didn't respond as expected. Try again in a moment.",
};

/** Safe, user-facing description of any failure; never echoes server or exception messages. */
export function describeProblem(error: unknown): ProblemView {
  if (error instanceof BackendApiError) {
    const known = BY_STATUS[error.status] ?? GENERIC;
    return { ...known, code: error.code, requestId: error.requestId };
  }
  if (error instanceof ZodError) {
    return {
      title: GENERIC.title,
      message:
        "The platform returned data this page couldn't read. Try again, or report the reference.",
      code: 'contract_mismatch',
      requestId: null,
    };
  }
  return { ...GENERIC, code: null, requestId: null };
}
```

`lib/api/load.ts`:

```ts
import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BackendApiError } from '@/auth/backend-api';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { describeProblem, type ProblemView } from './problem';

export type Loaded<T> = { ok: true; value: T } | { ok: false; problem: ProblemView };

/** 401 → login; a stale or missing context → context selection, keeping the current path. */
export function redirectIfSessionLost(error: unknown, requestHeaders: Headers): void {
  if (!(error instanceof BackendApiError)) return;
  if (error.status === 401) redirect('/login?reason=session_expired');
  if (error.code === 'invalid_active_tenant_context') {
    redirect(contextSelectionRedirectPath(requestHeaders));
  }
}

/** Settles a page's backend read; failures that don't redirect become a safe `ErrorState` view. */
export async function load<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    redirectIfSessionLost(error, await headers());
    return { ok: false, problem: describeProblem(error) };
  }
}
```

Run `pnpm test:run lib/api` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/api modules/platform-administration/platform-administration-queries.ts
git commit -m "$(cat <<'EOF'
feat(api): add wire helpers, a context-scoped GET, safe problem views, and page loaders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Shared data-display components

**Files (all under `components/data-display/`):**

- Create: `status-chip.tsx` + `status-chip.test.tsx`
- Create: `description-list.tsx`, `empty-state.tsx`, `error-state.tsx` (+ `data-display.test.tsx`
  covering these three). `SectionCard` has no consumer here; PR 07 adds it.
- Create: `list-toolbar.tsx` + `list-toolbar.test.tsx` (client)
- Create: `table-pagination-bar.tsx` + `table-pagination-bar.test.tsx` (client)
- Create: `truncated-text.tsx`
- Create: `lib/format.ts` + `lib/format.test.ts`

**Interfaces:**

- Produces:
  - `humanizeEnum(value: string): string`, `statusTone(value: string): StatusTone`,
    `StatusChip({ value: string; label?: string; tone?: StatusTone })`.
  - `DescriptionList({ items: readonly { label: string; value: ReactNode }[]; columns?: 1 | 2 })`.
  - `EmptyState({ title: string; description?: string })`, `ErrorState({ problem: ProblemView })`.
  - `TruncatedText({ value: string; maxWidth: number | string; variant?: TypographyVariant })` —
    `noWrap` with the full value in `title`.
  - `ListToolbar({ fields: readonly ToolbarField[]; resultLabel: string; chips?: readonly
ToolbarChip[] })` where `ToolbarField = { kind: 'select'; name: string; label: string; options:
readonly { value: string; label: string }[]; allLabel: string } | { kind: 'datetime'; name:
string; label: string }` and `ToolbarChip = { label: string; removeParam: string }`. Changing a
    field updates the URL param (empty → removed) and resets `page`.
  - `TablePaginationBar({ page: PageMetadata; rowsPerPageOptions?: readonly number[] })` — writes
    `page` (0-based) and `size` to the URL; options default to `PAGE_SIZES` (Task 1).
  - `lib/format.ts`: `formatInstant(iso: string, timeZone: string): { date: string; time: string }`
    (`07 Sep 2026` / `10:28`), `shortId(id: string): string` (first 8 chars).

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (design-system command with `"audit trail data table"`,
plus `--domain ux "data table filters pagination density"` and `--stack nextjs "search params"`).

- [ ] **Step 2: Write the failing tests**

`components/data-display/status-chip.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { humanizeEnum, StatusChip, statusTone } from './status-chip';

describe('status chip', () => {
  it('humanizes backend enums', () => {
    expect(humanizeEnum('PENDING_APPROVAL')).toBe('Pending approval');
    expect(humanizeEnum('ACTIVE')).toBe('Active');
    expect(humanizeEnum('PROVISIONING_IDP')).toBe('Provisioning idp');
  });

  it.each([
    ['ACTIVE', 'success'],
    ['SUCCESS', 'success'],
    ['COMPLETED', 'success'],
    ['PENDING_APPROVAL', 'warning'],
    ['DRAFT', 'warning'],
    ['SUSPENDED', 'error'],
    ['DENIED', 'error'],
    ['FAILURE', 'error'],
    ['HIGH', 'error'],
    ['MEDIUM', 'warning'],
    ['INFO', 'default'],
    ['SOMETHING_NEW', 'default'],
  ])('%s has the %s tone', (value, tone) => {
    expect(statusTone(value)).toBe(tone);
  });

  it('renders the label as text, never colour alone', () => {
    renderWithProviders(<StatusChip value="PENDING_APPROVAL" />);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
  });
});
```

`components/data-display/data-display.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { DescriptionList } from './description-list';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';

describe('data display', () => {
  it('renders a description list as term/definition pairs', () => {
    renderWithProviders(<DescriptionList items={[{ label: 'Branch code', value: 'WST-002' }]} />);
    expect(screen.getByRole('term')).toHaveTextContent('Branch code');
    expect(screen.getByRole('definition')).toHaveTextContent('WST-002');
  });

  it('renders empty and error states, including the support reference', () => {
    renderWithProviders(
      <>
        <EmptyState title="No audit events" description="Try other filters." />
        <ErrorState
          problem={{
            title: 'Access denied',
            message: 'No permission.',
            code: 'forbidden',
            requestId: 'req-1',
          }}
        />
      </>,
    );
    expect(screen.getByText('No audit events')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.getByRole('alert')).toHaveTextContent('req-1');
  });
});
```

`components/data-display/list-toolbar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ListToolbar } from './list-toolbar';

const push = vi.fn();
let search = 'entityType=USER&page=2';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(search),
  };
});

const FIELDS = [
  {
    kind: 'select' as const,
    name: 'entityType',
    label: 'Entity type',
    allLabel: 'All entity types',
    options: [
      { value: 'USER', label: 'User' },
      { value: 'BRANCH', label: 'Branch' },
    ],
  },
];

describe('ListToolbar', () => {
  beforeEach(() => {
    push.mockReset();
    search = 'entityType=USER&page=2';
  });

  it('writes a filter to the URL and resets the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'Branch' }));

    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=BRANCH', { scroll: false });
  });

  it('removes a filter when "all" is chosen and clears everything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ListToolbar fields={FIELDS} resultLabel="41 events" />);

    await user.click(screen.getByRole('combobox', { name: 'Entity type' }));
    await user.click(screen.getByRole('option', { name: 'All entity types' }));
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });

    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('shows the result count and removable chips', async () => {
    search = 'actorId=0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    const user = userEvent.setup();
    renderWithProviders(
      <ListToolbar
        fields={FIELDS}
        resultLabel="3 events"
        chips={[{ label: 'Actor: Jane', removeParam: 'actorId' }]}
      />,
    );

    expect(screen.getByText('3 events')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Actor: Jane' }).focus();
    await user.keyboard('{Delete}');
    expect(push).toHaveBeenCalledWith('/admin/audit', { scroll: false });
  });
});
```

`components/data-display/table-pagination-bar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { TablePaginationBar } from './table-pagination-bar';

const push = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/admin/audit',
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams('entityType=USER'),
  };
});

const PAGE = {
  number: 0,
  size: 10,
  totalItems: 25,
  totalPages: 3,
  hasNext: true,
  hasPrevious: false,
};

describe('TablePaginationBar', () => {
  it('moves to the next page keeping filters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TablePaginationBar page={PAGE} />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER&page=1', { scroll: false });
  });

  it('changes rows per page and returns to the first page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TablePaginationBar page={{ ...PAGE, number: 2 }} />);

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(screen.getByRole('option', { name: '50' }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER&size=50', { scroll: false });
  });
});
```

`lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatInstant, shortId } from './format';

describe('format', () => {
  it('formats an instant in the given timezone as a dense date and 24h time', () => {
    expect(formatInstant('2026-09-07T07:28:00Z', 'Africa/Nairobi')).toEqual({
      date: '07 Sep 2026',
      time: '10:28',
    });
    expect(formatInstant('2026-09-07T07:28:00Z', 'UTC')).toEqual({
      date: '07 Sep 2026',
      time: '07:28',
    });
  });

  it('shortens identifiers for display', () => {
    expect(shortId('0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('0b6f2f3a');
  });
});
```

Run `pnpm test:run components/data-display lib/format.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/format.ts`**

```ts
// Fixed abbreviations: current ICU renders en-GB September as "Sept"; the prototype uses "Sep".
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Dense formatting for operational tables (server-rendered only): `07 Sep 2026` / `10:28`. */
export function formatInstant(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.day ?? ''} ${SHORT_MONTHS[Number(parts.month) - 1] ?? ''} ${parts.year ?? ''}`,
    time: `${parts.hour ?? ''}:${parts.minute ?? ''}`,
  };
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
```

- [ ] **Step 4: Implement the presentational components**

`components/data-display/status-chip.tsx`:

```tsx
import Chip from '@mui/material/Chip';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'default';

const TONES: Record<string, StatusTone> = {
  ACTIVE: 'success',
  SUCCESS: 'success',
  COMPLETED: 'success',
  OPEN: 'success',
  APPROVED: 'success',
  PENDING_APPROVAL: 'warning',
  PENDING_ACTIVATION: 'warning',
  DRAFT: 'warning',
  INVITED: 'warning',
  QUEUED: 'warning',
  PROVISIONING: 'warning',
  PROVISIONING_IDP: 'warning',
  PROVISIONING_IDENTITY: 'warning',
  CLOSING: 'warning',
  DEACTIVATING: 'warning',
  DEPROVISIONING: 'warning',
  MEDIUM: 'warning',
  SUSPENDED: 'error',
  REJECTED: 'error',
  REVOKED: 'error',
  DEACTIVATED: 'error',
  DEPROVISIONED: 'error',
  LOCKED: 'error',
  DISABLED: 'error',
  FAILURE: 'error',
  FAILED: 'error',
  DENIED: 'error',
  HIGH: 'error',
  CRITICAL: 'error',
};

export function statusTone(value: string): StatusTone {
  return TONES[value] ?? 'default';
}

export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface StatusChipProps {
  value: string;
  label?: string;
  tone?: StatusTone;
}

/** The prototype's status badge: a soft pill whose label always carries the meaning. */
export function StatusChip({ value, label, tone = statusTone(value) }: StatusChipProps) {
  return <Chip size="small" variant="soft" color={tone} label={label ?? humanizeEnum(value)} />;
}
```

(`color="default"` is a valid Chip colour; the soft variant's base style applies.)

`components/data-display/description-list.tsx`:

```tsx
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface DescriptionItem {
  label: string;
  value: ReactNode;
}

interface DescriptionListProps {
  items: readonly DescriptionItem[];
  columns?: 1 | 2;
}

/** Label/value grid (prototype `.description-list`), two columns from `md` by default. */
export function DescriptionList({ items, columns = 2 }: DescriptionListProps) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        px: 4.5,
        pb: 4.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: columns === 2 ? '1fr 1fr' : '1fr' },
        columnGap: 7,
      }}
    >
      {items.map((item) => (
        <Box
          key={item.label}
          sx={{
            minHeight: 51,
            py: 2.75,
            display: 'grid',
            gridTemplateColumns: 'minmax(105px, 0.75fr) 1.25fr',
            alignItems: 'start',
            gap: 3,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography component="dt" variant="body2" color="text.secondary">
            {item.label}
          </Typography>
          <Typography
            component="dd"
            variant="body1"
            sx={{ m: 0, fontWeight: 650, overflowWrap: 'anywhere' }}
          >
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
```

`components/data-display/empty-state.tsx`:

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Box
      sx={{
        minHeight: 240,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        p: 6,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <Inventory2Outlined sx={{ fontSize: 34 }} aria-hidden="true" />
      <Typography component="p" variant="h5" color="text.primary">
        {title}
      </Typography>
      {description && <Typography variant="body2">{description}</Typography>}
    </Box>
  );
}
```

`components/data-display/error-state.tsx`:

```tsx
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Typography from '@mui/material/Typography';
import type { ProblemView } from '@/lib/api/problem';

/** Safe failure message with the backend request id as a support reference. */
export function ErrorState({ problem }: { problem: ProblemView }) {
  return (
    <Alert severity="error" sx={{ m: 4 }}>
      <AlertTitle>{problem.title}</AlertTitle>
      {problem.message}
      {problem.requestId && (
        <Typography variant="caption" component="p" sx={{ mt: 1 }}>
          Reference: {problem.requestId}
        </Typography>
      )}
    </Alert>
  );
}
```

(`ProblemView` is a type-only import from a server-only module — erased at compile time, so this
component stays usable from Server Components without pulling server code into client bundles.)

`components/data-display/truncated-text.tsx`:

```tsx
import Typography from '@mui/material/Typography';
import type { TypographyProps } from '@mui/material/Typography';

interface TruncatedTextProps {
  value: string;
  maxWidth: number | string;
  variant?: TypographyProps['variant'];
  color?: TypographyProps['color'];
}

/** Single-line text that truncates with an ellipsis and keeps the full value in `title`. */
export function TruncatedText({ value, maxWidth, variant = 'body2', color }: TruncatedTextProps) {
  return (
    <Typography
      component="span"
      variant={variant}
      color={color}
      noWrap
      title={value}
      sx={{ display: 'block', maxWidth }}
    >
      {value}
    </Typography>
  );
}
```

- [ ] **Step 5: Implement the URL-driven client controls**

`components/data-display/list-toolbar.tsx`:

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

export type ToolbarField =
  | {
      kind: 'select';
      name: string;
      label: string;
      allLabel: string;
      options: readonly { value: string; label: string }[];
    }
  | { kind: 'datetime'; name: string; label: string };

export interface ToolbarChip {
  label: string;
  removeParam: string;
}

interface ListToolbarProps {
  fields: readonly ToolbarField[];
  resultLabel: string;
  chips?: readonly ToolbarChip[];
}

const ALL = '';

/** Converts a stored ISO instant to the `datetime-local` value in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Filter bar (prototype `.toolbar`). Every change rewrites the URL and returns to page 0. */
export function ListToolbar({ fields, resultLabel, chips = [] }: ListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const setParam = (name: string, value: string) => {
    navigate((params) => {
      if (value) params.set(name, value);
      else params.delete(name);
    });
  };

  return (
    <Box
      sx={{
        minHeight: 64,
        px: 3.5,
        py: 2.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: 2.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {fields.map((field) =>
        field.kind === 'select' ? (
          <FormControl key={field.name} sx={{ minWidth: 180 }}>
            <InputLabel id={`${field.name}-label`}>{field.label}</InputLabel>
            <Select
              labelId={`${field.name}-label`}
              label={field.label}
              value={searchParams.get(field.name) ?? ALL}
              displayEmpty
              onChange={(event) => {
                setParam(field.name, event.target.value);
              }}
            >
              <MenuItem value={ALL}>{field.allLabel}</MenuItem>
              {field.options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            // Uncontrolled; keyed on the URL value so "Clear filters" and chip removal reset it.
            key={`${field.name}:${searchParams.get(field.name) ?? ''}`}
            type="datetime-local"
            label={field.label}
            sx={{ width: 210 }}
            defaultValue={toLocalInput(searchParams.get(field.name))}
            onBlur={(event) => {
              const value = event.target.value;
              setParam(field.name, value ? new Date(value).toISOString() : '');
            }}
          />
        ),
      )}
      {chips.map((chip) => (
        <Chip
          key={chip.removeParam}
          label={chip.label}
          onDelete={() => {
            setParam(chip.removeParam, '');
          }}
          sx={{ alignSelf: 'center' }}
        />
      ))}
      <Link
        component={NextLink}
        href={pathname}
        sx={{ alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700 }}
      >
        Clear filters
      </Link>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
        {resultLabel}
      </Typography>
    </Box>
  );
}
```

(A deletable MUI `Chip` is a focusable `role="button"` named by its label; Delete/Backspace on it
calls `onDelete`, and the icon is clickable. "Clear filters" is the other way out.)

`components/data-display/table-pagination-bar.tsx`:

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import TablePagination from '@mui/material/TablePagination';
import { PAGE_SIZES } from '@/lib/api/paging';
import type { PageMetadata } from '@/lib/api/wire';

interface TablePaginationBarProps {
  page: PageMetadata;
  rowsPerPageOptions?: readonly number[];
}

/** Server-side pagination (prototype `.pagination`): writes 0-based `page` and `size` to the URL. */
export function TablePaginationBar({
  page,
  rowsPerPageOptions = PAGE_SIZES,
}: TablePaginationBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <TablePagination
      component="div"
      count={page.totalItems}
      page={page.number}
      rowsPerPage={page.size}
      rowsPerPageOptions={[...rowsPerPageOptions]}
      onPageChange={(_event, next) => {
        go((params) => {
          if (next === 0) params.delete('page');
          else params.set('page', String(next));
        });
      }}
      onRowsPerPageChange={(event) => {
        go((params) => {
          params.set('size', event.target.value);
          params.delete('page');
        });
      }}
      sx={{ borderTop: 1, borderColor: 'divider' }}
    />
  );
}
```

(`PageMetadata` is a type-only import, erased at compile time, so zod stays out of the client bundle.)

- [ ] **Step 6: Run and commit**

Run: `pnpm test:run components/data-display lib/format.test.ts && pnpm lint`
Expected: PASS.

```bash
git add components/data-display lib/format.ts lib/format.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add status chips, description lists, section cards, states, and URL-driven list controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Audit contract, query, service, and name lookups

**Files:**

- Create: `modules/administration/audit/audit-contract.ts`, `audit-contract.test.ts`
- Create: `modules/administration/audit/audit-query.ts`, `audit-query.test.ts`
- Create: `modules/administration/audit/audit-service.ts`, `audit-service.test.ts`
- Create: `lib/api/lookups.ts`, `lib/api/lookups.test.ts`

**Interfaces:**

- Consumes: Task 1 (`apiGet`, `pageSchema`, `instantSchema`, `UUID_PATTERN`, `toQueryString`,
  `parsePaging`).
- Produces:
  - `type AuditEvent = { id; occurredAt; actorType; actorUserId: string | null; branchId: string |
null; action; entityType; entityId: string | null; outcome; severity; reason: string | null }`,
    `type AuditEventDetail = AuditEvent & { actorExternalSubject; userAgent; correlationId;
requestId; beforeJson; afterJson; metadataJson: string }` (nullable strings), `auditPageSchema`,
    `auditDetailSchema`.
  - `interface AuditQuery { entityType?: string; entityId?: string; actorId?: string; action?:
string; occurredFrom?: string; occurredTo?: string; page: number; size: number }`,
    `parseAuditQuery(params: URLSearchParams): AuditQuery` (drops invalid values; `size` default 20),
    `auditApiPath(query): string`.
  - `listAuditEvents(query): Promise<Page<AuditEvent>>`, `getAuditEvent(id): Promise<AuditEventDetail>`.
  - `lookups.ts`: `getTenantUser(userId): Promise<{ id: string; displayName: string; email: string }
| null>` (`cache`), `resolveUserNames(ids): Promise<ReadonlyMap<string, string>>`,
    `getBranchIndex(): Promise<ReadonlyMap<string, { name: string; code: string }>>` (`cache`; ≤ 5
    pages × 100), `getOrganisationTimeZone(): Promise<string>` (`cache`; `GET /tenant` →
    `timezone`, falls back to `'UTC'`).

- [ ] **Step 1: Write the failing contract and query tests**

`modules/administration/audit/audit-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auditDetailSchema, auditPageSchema } from './audit-contract';

const page = {
  number: 0,
  size: 20,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

const summary = {
  id: 'e1',
  occurred_at: '2026-09-07T07:28:00Z',
  actor_type: 'USER',
  actor_id: 'u1',
  branch_id: null,
  action: 'user.invite',
  resource_type: 'USER',
  resource_id: 'u2',
  outcome: 'SUCCESS',
  severity: 'INFO',
  reason: null,
};

describe('audit contract', () => {
  it('maps the summary names (resource_*, actor_id) to the domain shape', () => {
    expect(auditPageSchema.parse({ items: [summary], page }).items[0]).toEqual({
      id: 'e1',
      occurredAt: '2026-09-07T07:28:00Z',
      actorType: 'USER',
      actorUserId: 'u1',
      branchId: null,
      action: 'user.invite',
      entityType: 'USER',
      entityId: 'u2',
      outcome: 'SUCCESS',
      severity: 'INFO',
      reason: null,
    });
  });

  it('maps the detail names (entity_*, actor_user_id) to the same domain fields', () => {
    const detail = auditDetailSchema.parse({
      id: 'e1',
      organisation_id: 'o1',
      occurred_at: '2026-09-07T07:28:00Z',
      actor_user_id: 'u1',
      actor_external_subject: 'kc-1',
      actor_type: 'USER',
      branch_id: null,
      event_type: 'USER',
      entity_type: 'USER',
      entity_id: 'u2',
      action: 'user.invite',
      outcome: 'SUCCESS',
      severity: 'INFO',
      ip_address: null,
      user_agent: 'Mozilla',
      correlation_id: 'c1',
      request_id: 'r1',
      before_json: null,
      after_json: '{"status":"DRAFT"}',
      metadata_json: '{}',
      reason: 'New teller',
    });
    expect(detail).toMatchObject({
      actorUserId: 'u1',
      entityType: 'USER',
      entityId: 'u2',
      afterJson: '{"status":"DRAFT"}',
    });
  });

  it('rejects a summary with a missing field (schema drift)', () => {
    const { action: _omit, ...broken } = summary;
    expect(auditPageSchema.safeParse({ items: [broken], page }).success).toBe(false);
  });
});
```

`modules/administration/audit/audit-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auditApiPath, parseAuditQuery } from './audit-query';

const USER_ID = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('audit query', () => {
  it('keeps valid filters and paging', () => {
    const query = parseAuditQuery(
      new URLSearchParams(
        `entityType=USER&action=user.invite&actorId=${USER_ID}&occurredFrom=2026-09-01T00:00:00.000Z&page=2&size=50`,
      ),
    );
    expect(query).toEqual({
      entityType: 'USER',
      action: 'user.invite',
      actorId: USER_ID,
      occurredFrom: '2026-09-01T00:00:00.000Z',
      page: 2,
      size: 50,
    });
  });

  it('drops unknown entity types, malformed ids and instants, and bad paging', () => {
    expect(
      parseAuditQuery(
        new URLSearchParams('entityType=NOPE&actorId=x&occurredTo=yesterday&page=-1&size=7'),
      ),
    ).toEqual({ page: 0, size: 20 });
  });

  it('builds the snake_case API path', () => {
    expect(auditApiPath({ entityType: 'BRANCH', page: 1, size: 20 })).toBe(
      '/api/v1/tenant/audit-events?entity_type=BRANCH&page=1&size=20',
    );
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement the contract and query**

`modules/administration/audit/audit-contract.ts`:

```ts
import { z } from 'zod';
import { instantSchema, pageSchema } from '@/lib/api/wire';

const nullableString = z.string().nullable();

const auditSummarySchema = z
  .object({
    id: z.string(),
    occurred_at: instantSchema,
    actor_type: z.string(),
    actor_id: nullableString,
    branch_id: nullableString,
    action: z.string(),
    resource_type: z.string(),
    resource_id: nullableString,
    outcome: z.string(),
    severity: z.string(),
    reason: nullableString,
  })
  .transform((event) => ({
    id: event.id,
    occurredAt: event.occurred_at,
    actorType: event.actor_type,
    actorUserId: event.actor_id,
    branchId: event.branch_id,
    action: event.action,
    entityType: event.resource_type,
    entityId: event.resource_id,
    outcome: event.outcome,
    severity: event.severity,
    reason: event.reason,
  }));

export type AuditEvent = z.output<typeof auditSummarySchema>;

export const auditPageSchema = pageSchema(auditSummarySchema);

export const auditDetailSchema = z
  .object({
    id: z.string(),
    organisation_id: z.string(),
    occurred_at: instantSchema,
    actor_user_id: nullableString,
    actor_external_subject: nullableString,
    actor_type: z.string(),
    branch_id: nullableString,
    event_type: z.string(),
    entity_type: z.string(),
    entity_id: nullableString,
    action: z.string(),
    outcome: z.string(),
    severity: z.string(),
    ip_address: nullableString,
    user_agent: nullableString,
    correlation_id: nullableString,
    request_id: nullableString,
    before_json: nullableString,
    after_json: nullableString,
    metadata_json: z.string(),
    reason: nullableString,
  })
  .transform((event) => ({
    id: event.id,
    occurredAt: event.occurred_at,
    actorType: event.actor_type,
    actorUserId: event.actor_user_id,
    actorExternalSubject: event.actor_external_subject,
    branchId: event.branch_id,
    action: event.action,
    entityType: event.entity_type,
    entityId: event.entity_id,
    outcome: event.outcome,
    severity: event.severity,
    reason: event.reason,
    userAgent: event.user_agent,
    correlationId: event.correlation_id,
    requestId: event.request_id,
    beforeJson: event.before_json,
    afterJson: event.after_json,
    metadataJson: event.metadata_json,
  }));

export type AuditEventDetail = z.output<typeof auditDetailSchema>;
```

`modules/administration/audit/audit-query.ts`:

```ts
import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { UUID_PATTERN, instantSchema } from '@/lib/api/wire';
import { AUDIT_ENTITY_TYPES } from './audit-vocabulary';

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  occurredFrom?: string;
  occurredTo?: string;
  page: number;
  size: number;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 20;

function uuidParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && UUID_PATTERN.test(value) ? value : undefined;
}

function instantParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && instantSchema.safeParse(value).success ? value : undefined;
}

/** URL → validated audit query; anything malformed is dropped rather than sent upstream. */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const entityType = params.get('entityType');
  const action = params.get('action')?.trim();

  const query: AuditQuery = parsePaging(params, DEFAULT_AUDIT_PAGE_SIZE);
  if (entityType && AUDIT_ENTITY_TYPES.some((type) => type.value === entityType)) {
    query.entityType = entityType;
  }
  if (action && /^[a-z_]+\.[a-z_]+$/.test(action)) query.action = action;
  const entityId = uuidParam(params, 'entityId');
  if (entityId) query.entityId = entityId;
  const actorId = uuidParam(params, 'actorId');
  if (actorId) query.actorId = actorId;
  const occurredFrom = instantParam(params, 'occurredFrom');
  if (occurredFrom) query.occurredFrom = occurredFrom;
  const occurredTo = instantParam(params, 'occurredTo');
  if (occurredTo) query.occurredTo = occurredTo;
  return query;
}

export function auditApiPath(query: AuditQuery): string {
  return `/api/v1/tenant/audit-events${toQueryString({
    entity_type: query.entityType,
    entity_id: query.entityId,
    actor_id: query.actorId,
    action: query.action,
    occurred_from: query.occurredFrom,
    occurred_to: query.occurredTo,
    page: query.page,
    size: query.size,
  })}`;
}
```

Task 4 creates `audit-vocabulary.ts`; to keep this task self-contained, create it now with just the
entity list and fill in actions in Task 4:

```ts
export const AUDIT_ENTITY_TYPES = [
  { value: 'USER', label: 'User' },
  { value: 'USER_ACCOUNT', label: 'User account' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'USER_ROLE_ASSIGNMENT', label: 'Role assignment' },
  { value: 'USER_BRANCH_ASSIGNMENT', label: 'Branch assignment' },
  { value: 'ROLE', label: 'Role' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'ORGANISATION', label: 'Organisation' },
  { value: 'ORGANISATION_SETTING', label: 'Setting' },
  { value: 'BUSINESS_DATE', label: 'Business date' },
] as const;
```

Run the contract and query tests → PASS.

- [ ] **Step 3: Write the failing service and lookup tests**

`modules/administration/audit/audit-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const { getAuditEvent, listAuditEvents } = await import('./audit-service');

describe('audit service', () => {
  it('lists events through the validated page schema', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { number: 0 } });
    await listAuditEvents({ entityType: 'USER', page: 0, size: 20 });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/audit-events?entity_type=USER&page=0&size=20',
      expect.anything(),
    );
  });

  it('refuses a non-UUID event id before calling the backend', async () => {
    await expect(getAuditEvent('../../etc')).rejects.toThrow();
    expect(apiGet).not.toHaveBeenCalledWith(expect.stringContaining('etc'), expect.anything());
  });
});
```

`lib/api/lookups.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';

const apiGet = vi.fn();
vi.mock('./tenant-api', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) as unknown }));

const { getBranchIndex, getOrganisationTimeZone, resolveUserNames } = await import('./lookups');

describe('lookups', () => {
  it('resolves each distinct user id once and skips unresolvable ones', async () => {
    apiGet.mockImplementation((path: string) =>
      path.endsWith('/u1')
        ? Promise.resolve({ id: 'u1', displayName: 'Jane', email: 'j@x' })
        : Promise.reject(new BackendApiError(404)),
    );

    const names = await resolveUserNames(['u1', 'u1', 'u2']);

    expect(names.get('u1')).toBe('Jane');
    expect(names.has('u2')).toBe(false);
    expect(apiGet.mock.calls.filter(([path]) => String(path).endsWith('/u1'))).toHaveLength(1);
  });

  it('pages through branches up to the ceiling', async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({
        items: [{ id: 'b1', branchName: 'Head Office', branchCode: 'HQ' }],
        page: { hasNext: true },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'b2', branchName: 'Westlands', branchCode: 'WST' }],
        page: { hasNext: false },
      });

    const index = await getBranchIndex();

    expect(index.get('b2')).toEqual({ name: 'Westlands', code: 'WST' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('falls back to UTC when the organisation timezone is unreadable', async () => {
    apiGet.mockReset();
    apiGet.mockRejectedValueOnce(new BackendApiError(403));
    await expect(getOrganisationTimeZone()).resolves.toBe('UTC');
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement the service and lookups**

`modules/administration/audit/audit-service.ts`:

```ts
import 'server-only';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema, type Page } from '@/lib/api/wire';
import {
  auditDetailSchema,
  auditPageSchema,
  type AuditEvent,
  type AuditEventDetail,
} from './audit-contract';
import { auditApiPath, type AuditQuery } from './audit-query';

export function listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>> {
  return apiGet(auditApiPath(query), auditPageSchema);
}

export async function getAuditEvent(eventId: string): Promise<AuditEventDetail> {
  return apiGet(`/api/v1/tenant/audit-events/${uuidSchema.parse(eventId)}`, auditDetailSchema);
}
```

`lib/api/lookups.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { apiGet } from './tenant-api';
import { pageSchema } from './wire';

const tenantUserSchema = z
  .object({ id: z.string(), display_name: z.string(), email: z.string() })
  .transform((user) => ({ id: user.id, displayName: user.display_name, email: user.email }));

const branchNameSchema = z
  .object({ id: z.string(), branch_name: z.string(), branch_code: z.string() })
  .transform((branch) => ({
    id: branch.id,
    branchName: branch.branch_name,
    branchCode: branch.branch_code,
  }));

const tenantTimeZoneSchema = z.object({ timezone: z.string() });

/** One `GET /tenant/users/{id}` per id per request; unreadable users resolve to null. */
export const getTenantUser = cache(
  async (userId: string): Promise<{ id: string; displayName: string; email: string } | null> => {
    try {
      return await apiGet(`/api/v1/tenant/users/${encodeURIComponent(userId)}`, tenantUserSchema);
    } catch {
      return null;
    }
  },
);

// ponytail: one read per distinct visible ID (≤ 2 × page size, usually a handful of actors). Swap
// for a paged user index like getBranchIndex if the read budget (600/min) ever bites.
export async function resolveUserNames(
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => getTenantUser(id)));
  return new Map(users.flatMap((user) => (user ? [[user.id, user.displayName] as const] : [])));
}

const BRANCH_PAGE_SIZE = 100;
// ponytail: name-resolution index capped at 500 branches; beyond that IDs render short. Add a
// backend name lookup (docs/backend-gaps.md BG-09) if tenants grow past it.
const BRANCH_PAGE_CEILING = 5;

export const getBranchIndex = cache(
  async (): Promise<ReadonlyMap<string, { name: string; code: string }>> => {
    const index = new Map<string, { name: string; code: string }>();
    try {
      for (let page = 0; page < BRANCH_PAGE_CEILING; page += 1) {
        const result = await apiGet(
          `/api/v1/branches?page=${page}&size=${BRANCH_PAGE_SIZE}&sort_by=branchName&sort_dir=ASC`,
          pageSchema(branchNameSchema),
        );
        result.items.forEach((branch) => {
          index.set(branch.id, { name: branch.branchName, code: branch.branchCode });
        });
        if (!result.page.hasNext) break;
      }
    } catch {
      // Without branch.view the index stays empty; callers fall back to short IDs.
    }
    return index;
  },
);

export const getOrganisationTimeZone = cache(async (): Promise<string> => {
  try {
    return (await apiGet('/api/v1/tenant', tenantTimeZoneSchema)).timezone;
  } catch {
    return 'UTC';
  }
});
```

(The lookup tests mock `apiGet` with already-parsed values, so they assert behaviour, not
parsing — the schemas are exercised by the E2E run against the fake API.)

Run `pnpm test:run modules/administration/audit lib/api` → PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/administration/audit lib/api/lookups.ts lib/api/lookups.test.ts
git commit -m "$(cat <<'EOF'
feat(audit): add the audit contract, query parsing, service, and cached name lookups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Audit vocabulary

**Files:**

- Modify: `modules/administration/audit/audit-vocabulary.ts` (complete it)
- Create: `modules/administration/audit/audit-vocabulary.test.ts`

**Interfaces:**

- Produces: `AUDIT_ENTITY_TYPES` (Task 3), `AUDIT_ACTIONS: readonly { value: string; label: string;
entityType: string }[]`, `actionsForEntityType(entityType?: string)`, `actionLabel(action: string):
string`, `entityTypeLabel(entityType: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { actionLabel, actionsForEntityType, entityTypeLabel } from './audit-vocabulary';

describe('audit vocabulary', () => {
  it('labels known actions and falls back readably for unknown ones', () => {
    expect(actionLabel('user.invite')).toBe('Invited user');
    expect(actionLabel('branch.create_draft')).toBe('Drafted branch');
    expect(actionLabel('gl_account.approve')).toBe('Gl account: approve');
  });

  it('narrows actions to an entity type', () => {
    const roleActions = actionsForEntityType('ROLE').map((action) => action.value);
    expect(roleActions).toContain('role.assign_permission');
    expect(roleActions).not.toContain('user.invite');
    expect(actionsForEntityType(undefined).length).toBeGreaterThan(roleActions.length);
  });

  it('labels entity types', () => {
    expect(entityTypeLabel('USER_ROLE_ASSIGNMENT')).toBe('Role assignment');
    expect(entityTypeLabel('GL_ACCOUNT')).toBe('Gl account');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Complete `audit-vocabulary.ts`** (append below `AUDIT_ENTITY_TYPES`)

```ts
import { humanizeEnum } from '@/components/data-display/status-chip';

/** Explicit actions from contract §G, grouped by the entity type they are recorded under. */
export const AUDIT_ACTIONS = [
  { value: 'user.invite', label: 'Invited user', entityType: 'USER' },
  { value: 'user.approve', label: 'Approved user', entityType: 'USER' },
  { value: 'user.keycloak_provisioning', label: 'Provisioned identity', entityType: 'USER' },
  { value: 'user.application_invite', label: 'Sent application invite', entityType: 'USER' },
  { value: 'user.welcome_email', label: 'Sent welcome email', entityType: 'USER' },
  { value: 'membership.suspend', label: 'Suspended membership', entityType: 'USER' },
  { value: 'membership.reactivate', label: 'Reactivated membership', entityType: 'USER' },
  {
    value: 'user.first_login_activation',
    label: 'Activated on first sign-in',
    entityType: 'USER_ACCOUNT',
  },
  { value: 'membership.revoke', label: 'Revoked membership', entityType: 'MEMBERSHIP' },
  { value: 'membership.activate', label: 'Activated membership', entityType: 'MEMBERSHIP' },
  { value: 'user.assign_role', label: 'Assigned role', entityType: 'USER_ROLE_ASSIGNMENT' },
  { value: 'user.revoke_role', label: 'Revoked role', entityType: 'USER_ROLE_ASSIGNMENT' },
  { value: 'role.create', label: 'Created role', entityType: 'ROLE' },
  { value: 'role.update', label: 'Updated role', entityType: 'ROLE' },
  { value: 'role.activate', label: 'Activated role', entityType: 'ROLE' },
  { value: 'role.deactivate', label: 'Deactivated role', entityType: 'ROLE' },
  { value: 'role.assign_permission', label: 'Granted permission', entityType: 'ROLE' },
  { value: 'role.remove_permission', label: 'Removed permission', entityType: 'ROLE' },
  { value: 'branch.create_draft', label: 'Drafted branch', entityType: 'BRANCH' },
  { value: 'branch.submit', label: 'Submitted branch', entityType: 'BRANCH' },
  { value: 'branch.activate', label: 'Activated branch', entityType: 'BRANCH' },
  { value: 'branch.suspend', label: 'Suspended branch', entityType: 'BRANCH' },
  { value: 'branch.reactivate', label: 'Reactivated branch', entityType: 'BRANCH' },
  { value: 'branch.close', label: 'Closed branch', entityType: 'BRANCH' },
  { value: 'branch.assign_user', label: 'Assigned user to branch', entityType: 'BRANCH' },
  { value: 'branch.revoke_user', label: 'Removed user from branch', entityType: 'BRANCH' },
  { value: 'organisation.create_draft', label: 'Drafted organisation', entityType: 'ORGANISATION' },
  {
    value: 'organisation.amend_draft',
    label: 'Amended organisation draft',
    entityType: 'ORGANISATION',
  },
  { value: 'organisation.submit', label: 'Submitted organisation', entityType: 'ORGANISATION' },
  { value: 'organisation.activate', label: 'Activated organisation', entityType: 'ORGANISATION' },
  { value: 'organisation.suspend', label: 'Suspended organisation', entityType: 'ORGANISATION' },
  {
    value: 'organisation.reactivate',
    label: 'Reactivated organisation',
    entityType: 'ORGANISATION',
  },
  { value: 'tenant.bootstrap_retry', label: 'Retried bootstrap', entityType: 'ORGANISATION' },
  { value: 'settings.update', label: 'Changed setting', entityType: 'ORGANISATION_SETTING' },
  { value: 'business_date.advance', label: 'Advanced business date', entityType: 'BUSINESS_DATE' },
  { value: 'cob.start', label: 'Started close of business', entityType: 'BUSINESS_DATE' },
  { value: 'cob.complete', label: 'Completed close of business', entityType: 'BUSINESS_DATE' },
  { value: 'business_date.reopen', label: 'Reopened business date', entityType: 'BUSINESS_DATE' },
] as const;

const LABELS = new Map<string, string>(AUDIT_ACTIONS.map((action) => [action.value, action.label]));

export function actionLabel(action: string): string {
  const known = LABELS.get(action);
  if (known) return known;
  const [subject = action, verb = ''] = action.split('.');
  return verb ? `${humanizeEnum(subject)}: ${verb.replace(/_/g, ' ')}` : humanizeEnum(subject);
}

export function actionsForEntityType(entityType: string | undefined) {
  return entityType
    ? AUDIT_ACTIONS.filter((action) => action.entityType === entityType)
    : [...AUDIT_ACTIONS];
}

export function entityTypeLabel(entityType: string): string {
  return (
    AUDIT_ENTITY_TYPES.find((type) => type.value === entityType)?.label ?? humanizeEnum(entityType)
  );
}
```

Move the `import` line to the top of the file. Run → PASS. Commit:

```bash
git add modules/administration/audit/audit-vocabulary.ts modules/administration/audit/audit-vocabulary.test.ts
git commit -m "$(cat <<'EOF'
feat(audit): label audit actions and entity types from the backend vocabulary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: The audit trail page and event drawer

**Files:**

- Create: `app/(authenticated)/admin/audit/page.tsx`
- Create: `modules/administration/audit/components/audit-filters.tsx` (client)
- Create: `modules/administration/audit/components/audit-event-table.tsx` (server)
- Create: `modules/administration/audit/components/audit-event-drawer.tsx` (client)
- Create: `modules/administration/audit/components/audit-event-table.test.tsx`,
  `audit-event-drawer.test.tsx`
- Modify: `modules/administration/administration-navigation.ts` (add Audit trail)

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces:
  - `AuditEventTable({ rows: readonly AuditRow[]; timeZone: string })` (the zone is shown in the
    "Date & time" header — spec §9's label when times fall back to UTC) where `AuditRow = { id; date; time; actorLabel;
actorFilterHref: string | null; actionLabel; action; reason: string | null; entityLabel;
branchLabel; outcome; severity; detailHref }` — all strings/nulls, built server-side.
  - `AuditEventDrawer({ detail: AuditDrawerDetail; closeHref: string })` (client; open whenever
    rendered) where `AuditDrawerDetail` is the formatted, serializable detail.
  - `AuditFilters({ entityType: string | undefined; resultLabel: string; actorChip: ToolbarChip |
null })` (client).

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (`--domain ux "detail drawer json diff"`).

- [ ] **Step 2: Write the failing component tests**

`modules/administration/audit/components/audit-event-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditEventTable, type AuditRow } from './audit-event-table';

const ROW: AuditRow = {
  id: 'e1',
  date: '07 Sep 2026',
  time: '10:28',
  actorLabel: 'Grace Nduku',
  actorFilterHref: '/admin/audit?actorId=u1',
  actionLabel: 'Invited user',
  action: 'user.invite',
  reason: 'New teller for Westlands',
  entityLabel: 'User · Mary Wanjiku',
  branchLabel: 'Westlands Branch',
  outcome: 'SUCCESS',
  severity: 'INFO',
  detailHref: '/admin/audit?event=e1',
};

describe('AuditEventTable', () => {
  it('renders dense two-line cells, status labels, and navigable links', () => {
    renderWithProviders(<AuditEventTable rows={[ROW]} timeZone="UTC" />);

    const table = screen.getByRole('table', { name: 'Audit events' });
    expect(
      within(table).getByRole('columnheader', { name: 'Date & time (UTC)' }),
    ).toBeInTheDocument();
    const row = within(table).getAllByRole('row')[1];
    if (!row) throw new Error('row missing');
    expect(within(row).getByText('07 Sep 2026')).toBeInTheDocument();
    expect(within(row).getByText('10:28')).toBeInTheDocument();
    expect(within(row).getByText('user.invite')).toBeInTheDocument();
    expect(within(row).getByText('New teller for Westlands')).toBeInTheDocument();
    expect(within(row).getByText('Success')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /view event/i })).toHaveAttribute(
      'href',
      '/admin/audit?event=e1',
    );
    expect(within(row).getByRole('link', { name: 'Grace Nduku' })).toHaveAttribute(
      'href',
      '/admin/audit?actorId=u1',
    );
  });

  it('keeps very long values on one line with the full text available', () => {
    const long = 'x'.repeat(120);
    renderWithProviders(<AuditEventTable rows={[{ ...ROW, entityLabel: long }]} timeZone="UTC" />);
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });
});
```

`modules/administration/audit/components/audit-event-drawer.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditEventDrawer } from './audit-event-drawer';

const push = vi.fn();
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) };
});

describe('AuditEventDrawer', () => {
  it('shows event facts and pretty-printed before/after JSON, and closes to the list URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuditEventDrawer
        closeHref="/admin/audit?entityType=USER"
        detail={{
          title: 'Invited user',
          occurred: '07 Sep 2026 · 10:28',
          facts: [
            { label: 'Actor', value: 'Grace Nduku' },
            { label: 'Reason', value: 'New teller' },
          ],
          before: null,
          after: '{\n  "status": "DRAFT"\n}',
          metadata: '{}',
        }}
      />,
    );

    expect(screen.getByRole('dialog', { name: /invited user/i })).toBeInTheDocument();
    expect(screen.getByText('Grace Nduku')).toBeInTheDocument();
    expect(screen.getByText(/"status": "DRAFT"/)).toBeInTheDocument();
    expect(screen.getByText('No previous state recorded.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(push).toHaveBeenCalledWith('/admin/audit?entityType=USER', { scroll: false });
  });
});
```

Run → FAIL.

- [ ] **Step 3: Implement the table (server)**

`modules/administration/audit/components/audit-event-table.tsx`:

```tsx
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';

export interface AuditRow {
  id: string;
  date: string;
  time: string;
  actorLabel: string;
  actorFilterHref: string | null;
  actionLabel: string;
  action: string;
  reason: string | null;
  entityLabel: string;
  branchLabel: string;
  outcome: string;
  severity: string;
  detailHref: string;
}

export function AuditEventTable({
  rows,
  timeZone,
}: {
  rows: readonly AuditRow[];
  timeZone: string;
}) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Audit events" sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>Date &amp; time ({timeZone})</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Entity</TableCell>
            <TableCell>Branch</TableCell>
            <TableCell>Outcome</TableCell>
            <TableCell>Severity</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Typography variant="body2">{row.date}</Typography>
                <Link
                  component={NextLink}
                  href={row.detailHref}
                  scroll={false}
                  variant="caption"
                  aria-label={`View event ${row.date} ${row.time}`}
                >
                  {row.time}
                </Link>
              </TableCell>
              <TableCell>
                {row.actorFilterHref ? (
                  <Link
                    component={NextLink}
                    href={row.actorFilterHref}
                    scroll={false}
                    variant="body2"
                  >
                    {row.actorLabel}
                  </Link>
                ) : (
                  <Typography variant="body2">{row.actorLabel}</Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {row.actionLabel}
                </Typography>
                <Box>
                  <Typography component="span" variant="caption" color="text.secondary">
                    {row.action}
                  </Typography>
                </Box>
                {row.reason && (
                  <TruncatedText
                    value={row.reason}
                    maxWidth={320}
                    variant="caption"
                    color="text.secondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <TruncatedText value={row.entityLabel} maxWidth={240} />
              </TableCell>
              <TableCell>
                <TruncatedText value={row.branchLabel} maxWidth={180} />
              </TableCell>
              <TableCell>
                <StatusChip value={row.outcome} />
              </TableCell>
              <TableCell>
                <StatusChip value={row.severity} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

(The "View event" accessible name is on the time link; the test matches it with `/view event/i`.)

- [ ] **Step 4: Implement the drawer (client) and filters (client)**

`modules/administration/audit/components/audit-event-drawer.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';

export interface AuditDrawerDetail {
  title: string;
  occurred: string;
  facts: readonly { label: string; value: string }[];
  before: string | null;
  after: string | null;
  metadata: string | null;
}

function JsonBlock({
  title,
  value,
  empty,
}: {
  title: string;
  value: string | null;
  empty: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {value ? (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 3,
            maxHeight: 280,
            overflow: 'auto',
            borderRadius: 1,
            bgcolor: 'surfaces.secondary',
            fontSize: '0.75rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      )}
    </Box>
  );
}

/** Event detail panel, open whenever rendered; closing navigates back to the list URL. */
export function AuditEventDrawer({
  detail,
  closeHref,
}: {
  detail: AuditDrawerDetail;
  closeHref: string;
}) {
  const router = useRouter();
  const close = () => {
    router.push(closeHref, { scroll: false });
  };

  return (
    <Drawer
      anchor="right"
      open
      onClose={close}
      // Drawer spreads unknown props onto the modal root; the dialog role and its name belong on
      // the paper, next to the heading that labels it.
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': 'audit-event-title',
          sx: { width: { xs: '100%', sm: 560 } },
        },
      }}
    >
      <Box
        sx={{
          px: 4.5,
          py: 3.75,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="overline" component="p" color="text.secondary">
            {detail.occurred}
          </Typography>
          <Typography id="audit-event-title" component="h2" variant="h4">
            {detail.title}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={close}>
          Close
        </Button>
      </Box>
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        <DescriptionList items={detail.facts} columns={1} />
        <Box
          sx={{
            p: 4.5,
            display: 'grid',
            gap: 4,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          <JsonBlock title="Before" value={detail.before} empty="No previous state recorded." />
          <JsonBlock title="After" value={detail.after} empty="No resulting state recorded." />
        </Box>
        <Box sx={{ px: 4.5, pb: 4.5 }}>
          <JsonBlock title="Metadata" value={detail.metadata} empty="No metadata." />
        </Box>
      </Box>
    </Drawer>
  );
}
```

`modules/administration/audit/components/audit-filters.tsx`:

```tsx
'use client';

import { ListToolbar, type ToolbarChip } from '@/components/data-display/list-toolbar';
import { AUDIT_ENTITY_TYPES, actionsForEntityType } from '../audit-vocabulary';

interface AuditFiltersProps {
  entityType: string | undefined;
  resultLabel: string;
  actorChip: ToolbarChip | null;
}

export function AuditFilters({ entityType, resultLabel, actorChip }: AuditFiltersProps) {
  return (
    <ListToolbar
      resultLabel={resultLabel}
      chips={actorChip ? [actorChip] : []}
      fields={[
        {
          kind: 'select',
          name: 'entityType',
          label: 'Entity type',
          allLabel: 'All entity types',
          options: AUDIT_ENTITY_TYPES,
        },
        {
          kind: 'select',
          name: 'action',
          label: 'Action',
          allLabel: 'All actions',
          options: actionsForEntityType(entityType),
        },
        { kind: 'datetime', name: 'occurredFrom', label: 'From' },
        { kind: 'datetime', name: 'occurredTo', label: 'To' },
      ]}
    />
  );
}
```

- [ ] **Step 5: Implement the page and the navigation item**

`app/(authenticated)/admin/audit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import { toSearchParams } from '@/lib/api/query-string';
import { actionLabel, entityTypeLabel } from '@/modules/administration/audit/audit-vocabulary';
import { parseAuditQuery } from '@/modules/administration/audit/audit-query';
import { getAuditEvent, listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  AuditEventDrawer,
  type AuditDrawerDetail,
} from '@/modules/administration/audit/components/audit-event-drawer';
import {
  AuditEventTable,
  type AuditRow,
} from '@/modules/administration/audit/components/audit-event-table';
import { AuditFilters } from '@/modules/administration/audit/components/audit-filters';
import { UUID_PATTERN } from '@/lib/api/wire';

export const metadata: Metadata = { title: 'Audit trail' };

interface AuditPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function hrefWith(params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  });
  const query = next.toString();
  return query ? `/admin/audit?${query}` : '/admin/audit';
}

function prettyJson(value: string | null): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function AuditTrailPage({ searchParams }: AuditPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseAuditQuery(params);
  const eventId = params.get('event');

  const [events, timeZone, branches] = await Promise.all([
    load(listAuditEvents(query)),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Audit trail"
      description="Search traceable administrative events by entity, action, actor, or date."
    />
  );

  if (!events.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={events.problem} />
        </Paper>
      </>
    );
  }

  const userIds = [
    ...events.value.items.flatMap((event) => (event.actorUserId ? [event.actorUserId] : [])),
    ...events.value.items.flatMap((event) =>
      event.entityType === 'USER' && event.entityId ? [event.entityId] : [],
    ),
    ...(query.actorId ? [query.actorId] : []),
  ];
  const names = await resolveUserNames(userIds);

  const rows: AuditRow[] = events.value.items.map((event) => {
    const when = formatInstant(event.occurredAt, timeZone);
    const actorName = event.actorUserId
      ? (names.get(event.actorUserId) ?? shortId(event.actorUserId))
      : 'System';
    const entityName =
      event.entityId === null
        ? '—'
        : event.entityType === 'USER'
          ? (names.get(event.entityId) ?? shortId(event.entityId))
          : event.entityType === 'BRANCH'
            ? (branches.get(event.entityId)?.name ?? shortId(event.entityId))
            : shortId(event.entityId);
    return {
      id: event.id,
      date: when.date,
      time: when.time,
      actorLabel: actorName,
      actorFilterHref: event.actorUserId
        ? hrefWith(params, { actorId: event.actorUserId, page: null, event: null })
        : null,
      actionLabel: actionLabel(event.action),
      action: event.action,
      reason: event.reason,
      entityLabel: `${entityTypeLabel(event.entityType)} · ${entityName}`,
      branchLabel: event.branchId
        ? (branches.get(event.branchId)?.name ?? shortId(event.branchId))
        : '—',
      outcome: event.outcome,
      severity: event.severity,
      detailHref: hrefWith(params, { event: event.id }),
    };
  });

  let drawer: AuditDrawerDetail | null = null;
  if (eventId && UUID_PATTERN.test(eventId)) {
    const detail = await load(getAuditEvent(eventId));
    if (detail.ok) {
      const d = detail.value;
      const when = formatInstant(d.occurredAt, timeZone);
      const actor = d.actorUserId
        ? ((await resolveUserNames([d.actorUserId])).get(d.actorUserId) ?? shortId(d.actorUserId))
        : 'System';
      drawer = {
        title: actionLabel(d.action),
        occurred: `${when.date} · ${when.time}`,
        facts: [
          { label: 'Action', value: d.action },
          {
            label: 'Actor',
            value: d.actorExternalSubject ? `${actor} (${d.actorExternalSubject})` : actor,
          },
          { label: 'Entity', value: `${entityTypeLabel(d.entityType)} · ${d.entityId ?? '—'}` },
          {
            label: 'Branch',
            value: d.branchId ? (branches.get(d.branchId)?.name ?? d.branchId) : '—',
          },
          { label: 'Outcome', value: d.outcome },
          { label: 'Severity', value: d.severity },
          { label: 'Reason', value: d.reason ?? '—' },
          { label: 'Request ID', value: d.requestId ?? '—' },
          { label: 'Correlation ID', value: d.correlationId ?? '—' },
          { label: 'User agent', value: d.userAgent ?? '—' },
        ],
        before: prettyJson(d.beforeJson),
        after: prettyJson(d.afterJson),
        metadata: prettyJson(d.metadataJson === '{}' ? null : d.metadataJson),
      };
    }
  }

  const total = events.value.page.totalItems;
  const actorChip = query.actorId
    ? {
        label: `Actor: ${names.get(query.actorId) ?? shortId(query.actorId)}`,
        removeParam: 'actorId',
      }
    : null;

  return (
    <>
      {header}
      <Paper sx={{ overflow: 'hidden' }}>
        <AuditFilters
          entityType={query.entityType}
          resultLabel={`${total} ${total === 1 ? 'event' : 'events'}`}
          actorChip={actorChip}
        />
        {rows.length === 0 ? (
          <EmptyState title="No audit events" description="No events match these filters." />
        ) : (
          <AuditEventTable rows={rows} timeZone={timeZone} />
        )}
        <TablePaginationBar page={events.value.page} />
      </Paper>
      {drawer && <AuditEventDrawer detail={drawer} closeHref={hrefWith(params, { event: null })} />}
    </>
  );
}
```

(`ListToolbar` and `TablePaginationBar` use `useSearchParams`. The page renders dynamically (it
reads cookies) and `cacheComponents` is off, so no Suspense boundary is needed around them.)

In `modules/administration/administration-navigation.ts`, import `Inventory2Outlined` and append:

```ts
  { href: '/admin/audit', label: 'Audit trail', icon: Inventory2Outlined, requiresAny: ['audit.view'] },
```

- [ ] **Step 6: Run and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add -A app/\(authenticated\)/admin/audit modules/administration
git commit -m "$(cat <<'EOF'
feat(audit): add the audit trail page with filters, pagination, and an event detail drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Fake-API audit endpoints, E2E, live read check

**Files:**

- Modify: `e2e/fake-api/state.mts` (add `FakeAuditEvent`, `auditEvents` on `RunState`)
- Modify: `e2e/fake-api/scenarios.mts` (seed 30 events in `greenfieldTenant`; add
  `no-audit-permission`)
- Create: `e2e/fake-api/routes/tenant-reads.mts` (`GET /api/v1/tenant`, `GET /api/v1/tenant/users/:user_id`,
  `GET /api/v1/branches`)
- Create: `e2e/fake-api/routes/audit.mts`
- Modify: `e2e/fake-api/server.mts` (register both)
- Modify: `e2e/support/auth.ts` (scenario union)
- Create: `e2e/audit.spec.ts`

- [ ] **Step 1: Extend the fake state and seed events**

In `state.mts` add and include `auditEvents: FakeAuditEvent[]` in `RunState`:

```ts
export interface FakeAuditEvent {
  id: string;
  organisationId: string;
  occurredAt: string;
  actorUserId: string | null;
  actorType: 'USER' | 'SYSTEM';
  branchId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  outcome: string;
  severity: string;
  reason: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  metadataJson: string;
}
```

In `scenarios.mts` add `FakeAuditEvent` to the `import type` list, add `auditEvents:
seedAuditEvents(),` to `greenfieldTenant()` and `auditEvents: [],` to `platformOperator()`. The other
builders (`longNames`, `multiOrg`, `duplicateAssignments`, `noBranches`) spread `greenfieldTenant()`,
so they inherit the events. Add the generator above `greenfieldTenant()`:

```ts
function seedAuditEvents(): FakeAuditEvent[] {
  const catalogue: [string, string, string | null, string][] = [
    ['USER', 'user.invite', IDS.jane, 'SUCCESS'],
    ['BRANCH', 'branch.create_draft', IDS.westlands, 'SUCCESS'],
    ['ROLE', 'role.update', IDS.tenantAdminRole, 'SUCCESS'],
    ['BUSINESS_DATE', 'cob.start', null, 'SUCCESS'],
    ['MEMBERSHIP', 'membership.revoke', IDS.greenfieldMembership, 'FAILURE'],
  ];
  return Array.from({ length: 30 }, (_, index) => {
    const [entityType = 'USER', action = 'user.invite', entityId = null, outcome = 'SUCCESS'] =
      catalogue[index % catalogue.length] ?? [];
    const minute = String(59 - index).padStart(2, '0');
    return {
      id: `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      organisationId: IDS.greenfield,
      occurredAt: `2026-09-07T07:${minute}:00Z`,
      actorUserId: index % 6 === 5 ? null : IDS.jane,
      actorType: index % 6 === 5 ? 'SYSTEM' : 'USER',
      branchId: index % 2 === 0 ? IDS.headOffice : null,
      entityType,
      entityId,
      action,
      outcome,
      severity: 'INFO',
      reason: index === 0 ? 'New teller joining the Westlands team' : null,
      beforeJson: index === 2 ? '{"role_name":"Tenant admin"}' : null,
      afterJson:
        index === 0
          ? '{"status":"DRAFT"}'
          : index === 2
            ? '{"role_name":"Tenant administrator"}'
            : null,
      metadataJson: '{}',
    };
  });
}
```

Add a reusable permission remover above `BUILDERS` (later slices reuse it for their own gating
scenarios) and register the scenario:

```ts
function withoutPermission(state: RunState, ...codes: string[]): RunState {
  return {
    ...state,
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: candidate.permissions.filter((permission) => !codes.includes(permission)),
    })),
  };
}
```

```ts
  'no-audit-permission': () => withoutPermission(greenfieldTenant(), 'audit.view'),
```

- [ ] **Step 2: Implement the fake read routes**

`e2e/fake-api/routes/tenant-reads.mts`:

```ts
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import { pageOf, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';
import type { FakeBranch } from '../state.mts';

const BRANCH_SORTS: Record<string, (branch: FakeBranch) => string> = {
  branchCode: (branch) => branch.code,
  branchName: (branch) => branch.name,
  branchType: (branch) => branch.type,
  status: (branch) => branch.status,
  createdAt: (branch) => branch.createdAt,
};

export const tenantReadRoutes: Route[] = [
  route('GET', '/api/v1/tenant', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'tenant.view');
    const tenant = access.organisation;
    sendJson(context.res, 200, {
      id: tenant.id,
      tenant_code: tenant.code,
      display_name: tenant.displayName,
      country_code: tenant.countryCode,
      base_currency_code: tenant.baseCurrencyCode,
      timezone: tenant.timezone,
      status: tenant.status,
      bootstrap_status: tenant.bootstrapStatus,
      bootstrap_failure_code: tenant.bootstrapFailureCode,
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
    });
  }),

  route('GET', '/api/v1/tenant/users/:user_id', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'user.view');
    const membership = context.state.memberships.find(
      (candidate) =>
        candidate.userId === context.params.user_id &&
        candidate.organisationId === access.organisation.id,
    );
    const user = context.state.users.find((candidate) => candidate.id === context.params.user_id);
    if (!membership || !user) {
      throw problem(404, 'resource_not_found', 'User not found.');
    }
    sendJson(context.res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.displayName,
      user_status: user.status,
      membership_status: membership.status,
    });
  }),

  route('GET', '/api/v1/branches', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'branch.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const type = query.get('type');
    const sortBy = query.get('sort_by') ?? 'createdAt';
    const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
    const key = BRANCH_SORTS[sortBy];
    if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
      throw problem(500, 'internal_error', 'An unexpected error occurred.');
    }
    const branches = context.state.branches
      .filter(
        (branch) =>
          branch.organisationId === access.organisation.id &&
          (!q || branch.code.toLowerCase().includes(q) || branch.name.toLowerCase().includes(q)) &&
          (!status || branch.status === status) &&
          (!type || branch.type === type),
      )
      .sort((a, b) => key(a).localeCompare(key(b)));
    const ordered = direction === 'DESC' ? branches.reverse() : branches;
    sendJson(
      context.res,
      200,
      pageOf(
        ordered.map((branch) => ({
          id: branch.id,
          organisation_id: branch.organisationId,
          branch_code: branch.code,
          branch_name: branch.name,
          branch_type: branch.type,
          status: branch.status,
          created_at: branch.createdAt,
        })),
        query,
      ),
    );
  }),
];
```

`e2e/fake-api/routes/audit.mts`:

```ts
import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import { pageOf, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';

export const auditRoutes: Route[] = [
  route('GET', '/api/v1/tenant/audit-events', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'audit.view');
    const { query } = context;
    const matches = context.state.auditEvents
      .filter(
        (event) =>
          event.organisationId === access.organisation.id &&
          (!query.get('entity_type') || event.entityType === query.get('entity_type')) &&
          (!query.get('entity_id') || event.entityId === query.get('entity_id')) &&
          (!query.get('actor_id') || event.actorUserId === query.get('actor_id')) &&
          (!query.get('action') || event.action === query.get('action')) &&
          (!query.get('occurred_from') || event.occurredAt >= (query.get('occurred_from') ?? '')) &&
          (!query.get('occurred_to') || event.occurredAt <= (query.get('occurred_to') ?? '')),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((event) => ({
        id: event.id,
        occurred_at: event.occurredAt,
        actor_type: event.actorType,
        actor_id: event.actorUserId,
        branch_id: event.branchId,
        action: event.action,
        resource_type: event.entityType,
        resource_id: event.entityId,
        outcome: event.outcome,
        severity: event.severity,
        reason: event.reason,
      }));
    sendJson(context.res, 200, pageOf(matches, query));
  }),

  route('GET', '/api/v1/tenant/audit-events/:event_id', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'audit.view');
    const event = context.state.auditEvents.find(
      (candidate) =>
        candidate.id === context.params.event_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!event) {
      throw problem(404, 'audit_event_not_found', 'Audit event not found.');
    }
    sendJson(context.res, 200, {
      id: event.id,
      organisation_id: event.organisationId,
      occurred_at: event.occurredAt,
      actor_user_id: event.actorUserId,
      actor_external_subject: event.actorUserId ? 'e2e-keycloak-subject' : null,
      actor_type: event.actorType,
      branch_id: event.branchId,
      event_type: event.entityType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action,
      outcome: event.outcome,
      severity: event.severity,
      ip_address: null,
      user_agent: 'Mozilla/5.0 (fake)',
      correlation_id: `corr-${event.id.slice(-4)}`,
      request_id: `req-${event.id.slice(-4)}`,
      before_json: event.beforeJson,
      after_json: event.afterJson,
      metadata_json: event.metadataJson,
      reason: event.reason,
    });
  }),
];
```

Register `...tenantReadRoutes, ...auditRoutes` in `server.mts`.

- [ ] **Step 3: Write `e2e/audit.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

async function enter(page: Page, path = '/admin/audit') {
  await page.goto(path);
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
}

test.describe('audit trail', () => {
  test('lists events, filters through the URL, and paginates', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Audit trail' })).toBeVisible();
    await expect(page.getByText('30 events')).toBeVisible();
    const table = page.getByRole('table', { name: 'Audit events' });
    await expect(table.getByRole('row')).toHaveCount(21); // header + 20

    await selectMuiOption(page, 'Entity type', /^Branch$/);
    await expect(page).toHaveURL(/entityType=BRANCH/);
    await expect(page.getByText('6 events')).toBeVisible();

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('30 events')).toBeVisible();
    await page.getByRole('button', { name: /next page/i }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(table.getByRole('row')).toHaveCount(11);
  });

  test('opens an event with its before/after state and closes it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await page
      .getByRole('link', { name: /view event/i })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: /invited user/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/"status": "DRAFT"/)).toBeVisible();
    await expect(drawer.getByText('New teller joining the Westlands team')).toBeVisible();

    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(page).not.toHaveURL(/event=/);
  });

  test('filters by actor from a row', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await page
      .getByRole('table', { name: 'Audit events' })
      .getByRole('link', { name: 'Backend Jane Manager' })
      .first()
      .click();
    await expect(page).toHaveURL(/actorId=/);
    await expect(page.getByText('Actor: Backend Jane Manager')).toBeVisible();
    await expect(page.getByText('25 events')).toBeVisible();
  });

  test('hides the audit trail without audit.view', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'no-audit-permission');
    await enter(page, '/admin');

    await expect(page.getByRole('link', { name: 'Audit trail' })).toHaveCount(0);
    await page.goto('/admin/audit');
    // Filtered: Next's route announcer is also an alert.
    await expect(page.getByRole('alert').filter({ hasText: 'Access denied' })).toBeVisible();
  });

  test('has no page-level horizontal scroll on mobile and no serious a11y violations', async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticate(context, testInfo);
    await enter(page);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
  });
});
```

Add `'no-audit-permission'` to `FakeApiScenario`.

- [ ] **Step 4: Gates**

```bash
pnpm exec prettier --write e2e
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. Run the ui-ux-pro-max checklist on `/admin/audit` (light/dark, 1440/375).

- [ ] **Step 5: Live read check (with the user)**

With the user signed in on the local app pointed at dev: open `/admin/audit`; confirm events render
(no error boundary), entity/action filters narrow results, pagination works, the drawer shows
before/after JSON, actor and branch names resolve (or fall back to short IDs where permissions are
missing), and times show in the organisation's timezone. Record any action value or field the
contract doesn't list in `docs/superpowers/specs/…-api-contract.md` §G.

- [ ] **Step 6: Commit**

```bash
git add e2e
git commit -m "$(cat <<'EOF'
test(e2e): cover audit filtering, pagination, the event drawer, gating, and mobile a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
