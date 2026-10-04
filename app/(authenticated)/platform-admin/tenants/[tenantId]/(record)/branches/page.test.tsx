import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { TENANT_STATUSES } from '@/modules/platform-administration/tenants/tenant-contract';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so their upper-case forms differ from them.
const T = '17000000-0000-4000-8000-0000000000ac';
const B = '17000000-0000-4000-8000-0000000000b2';

const { getCurrentContextProfile, getTenant, listInstitutionBranches, redirect } = vi.hoisted(
  () => ({
    getCurrentContextProfile: vi.fn(),
    getTenant: vi.fn(),
    listInstitutionBranches: vi.fn(),
    redirect: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => `/platform-admin/tenants/${T}/branches`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// parseInstitutionId reads the reserved platform organisation from here. A literal, because vi.mock
// is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/branches/institution-branch-service', () => ({
  listInstitutionBranches: (...args: unknown[]) => listInstitutionBranches(...args) as unknown,
}));

const { default: BranchesTab } = await import('./page');

// 22:30 UTC is already the next day in Africa/Nairobi (the runner's zone): "10 Jul" can only be UTC.
const MOMBASA = {
  id: B,
  branchCode: 'MOMBASA_RD',
  branchName: 'Mombasa Road Branch',
  branchType: 'OPERATIONS',
  status: 'ACTIVE',
  createdAt: '2026-07-10T22:30:00Z',
};

function branchPage(items: readonly (typeof MOMBASA)[], number = 0, totalPages = 1) {
  return {
    items,
    page: {
      number,
      size: 10,
      totalItems: items.length,
      totalPages,
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

interface Setup {
  permissions?: string[];
  status?: string;
  /** What the tenant read settles with; an Error rejects it. */
  tenant?: Error;
  /** What the list read settles with: a page, or an Error that rejects it. */
  list?: ReturnType<typeof branchPage> | Error;
}

/** Programs every read the tab makes. A test names only what it varies. */
function setup({
  permissions = ['branch.view', 'branch.create'],
  status = 'ACTIVE',
  tenant,
  list = branchPage([MOMBASA]),
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: '00000000-0000-0000-0000-000000000000', name: 'Platform' } },
  });
  if (tenant) getTenant.mockRejectedValue(tenant);
  else {
    getTenant.mockResolvedValue({
      id: T,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      countryCode: 'KE',
      status,
    });
  }
  if (list instanceof Error) listInstitutionBranches.mockRejectedValue(list);
  else listInstitutionBranches.mockResolvedValue(list);
}

async function show(
  searchParams: Record<string, string | string[] | undefined> = {},
  tenantId = T,
) {
  const element = await BranchesTab({
    params: Promise.resolve({ tenantId }),
    searchParams: Promise.resolve(searchParams),
  });
  return { element, ...(element ? renderWithProviders(element) : {}) };
}

/** The CSS Emotion emitted for an element's own class: jsdom folds `min()` into its first operand
 * in a computed style, so only the rule itself tells a capped width from the 320 px default. */
function emittedCss(element: HTMLElement): string {
  const emotionClass = [...element.classList].find((name) => name.startsWith('css-'));
  return [...document.querySelectorAll('style')]
    .map((style) => style.textContent)
    .filter((css) => emotionClass !== undefined && css.includes(`.${emotionClass}{`))
    .join('');
}

const section = () => screen.getByRole('region', { name: 'Branches' });
const draftLink = () => screen.queryByRole('link', { name: 'Create branch draft' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchesTab: the list', () => {
  it('offers Create branch draft for an active institution to a holder of both codes', async () => {
    setup();

    await show();

    expect(within(section()).getByRole('link', { name: 'Create branch draft' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/branches/new`,
    );
    expect(within(section()).getByRole('link', { name: 'Mombasa Road Branch' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/branches/${B}`,
    );
    expect(screen.getByRole('columnheader', { name: /Created \(UTC\)/ })).toBeVisible();
    expect(screen.getByText('10 Jul 2026')).toBeVisible();
    expect(listInstitutionBranches).toHaveBeenCalledWith(T, expect.objectContaining({ page: 0 }));
  });

  it('keeps the section, the table and its scroll region under three different names', async () => {
    setup();

    await show();

    // axe rates landmark-unique moderate, so the serious/critical gate would not catch a clash.
    expect(screen.getAllByRole('region', { name: 'Branches table' })).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: 'Branches' })).toHaveLength(1);
    expect(screen.getAllByRole('table', { name: 'Branches' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Branches' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('keeps a long name inside a narrow card, and sends the sort links and the toolbar to the tab', async () => {
    setup();

    await show();

    expect(emittedCss(screen.getByRole('link', { name: 'Mombasa Road Branch' }))).toContain(
      'max-width:min(320px, 60vw)',
    );
    const sort = new URL(
      screen.getByRole('link', { name: 'Branch' }).getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(sort.pathname).toBe(`/platform-admin/tenants/${T}/branches`);
    expect(sort.searchParams.get('sortBy')).toBe('branchName');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeVisible();
    expect(screen.getByText('1 branch')).toBeVisible();
  });

  it("redirects a page past the end to the institution's own last page", async () => {
    setup({ list: { ...branchPage([MOMBASA], 4, 2) } });

    await expect(show({ page: '4' })).rejects.toThrow(/^NEXT_REDIRECT:/);

    const target = new URL(
      (redirect.mock.calls[0]?.[0] as string | undefined) ?? '',
      'http://localhost',
    );
    expect(target.pathname).toBe(`/platform-admin/tenants/${T}/branches`);
    expect(target.searchParams.get('page')).toBe('1');
  });

  it("renders nothing when the institution can't be read, because the layout shows that failure", async () => {
    setup({ tenant: new BackendApiError(503, { requestId: 'req-t' }) });

    const { element } = await show();

    expect(element).toBeNull();
  });
});

describe('BranchesTab: the draft button', () => {
  it.each(TENANT_STATUSES.filter((status) => status !== 'ACTIVE'))(
    'offers no draft for an institution that is %s',
    async (status) => {
      setup({ status });

      await show();

      expect(draftLink()).toBeNull();
      // The list itself still shows.
      expect(screen.getByRole('link', { name: 'Mombasa Road Branch' })).toBeVisible();
    },
  );

  it.each([[['branch.view']], [['branch.create']], [[]]])(
    'offers no draft to a holder of %j',
    async (permissions) => {
      setup({ permissions });

      await show();

      expect(draftLink()).toBeNull();
    },
  );
});

describe('BranchesTab: failures and empty states', () => {
  it('shows the permission state on a 403 inside the section', async () => {
    setup({ list: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(within(section()).getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the error state, with its reference, on any other failure', async () => {
    setup({ list: new BackendApiError(503, { requestId: 'req-b' }) });

    await show();

    expect(within(section()).getByText('Reference: req-b')).toBeVisible();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    // A failed read is never an empty list.
    expect(screen.queryByText('No branches')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['no filter', {}, 'This institution has no branches yet.'],
    ['a status filter', { status: 'SUSPENDED' }, 'No branches match these filters.'],
    ['a search', { q: 'zzz' }, 'No branches match these filters.'],
    ['a type', { type: 'HEAD_OFFICE' }, 'No branches match these filters.'],
  ])('words the empty state by its filters: %s', async (_label, searchParams, description) => {
    setup({ list: branchPage([]) });

    await show(searchParams);

    expect(screen.getByText('No branches')).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  // Rule 21: every read is settled with load(), so a lost session redirects.
  it.each([
    ['the list read', { list: new BackendApiError(401) }],
    ['the institution read', { tenant: new BackendApiError(401) }],
  ])('redirects to login when %s finds the session lost', async (_label, programme) => {
    setup(programme);

    await expect(show()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
  });
});
