import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { KPI_UNAVAILABLE } from '@/components/data-display/kpi-tile';
import type { Page } from '@/lib/api/wire';
import type { TenantSummary } from '@/modules/platform-administration/tenants/tenant-contract';
import {
  ATTENTION_PREVIEW_SIZE,
  OVERVIEW_DESCRIPTION,
  PENDING_HREF,
} from '@/modules/platform-administration/overview/overview-rules';
import { renderWithProviders } from '@/test/test-utils';

const PLATFORM = '00000000-0000-0000-0000-000000000000';

const {
  countPlatformOperators,
  countTenantsInStatus,
  getCurrentContextProfile,
  listTenantsInStatus,
  redirect,
} = vi.hoisted(() => ({
  countPlatformOperators: vi.fn<() => Promise<number>>(),
  countTenantsInStatus: vi.fn<(status: string) => Promise<number>>(),
  getCurrentContextProfile: vi.fn(),
  listTenantsInStatus: vi.fn<(status: string, size: number) => Promise<Page<TenantSummary>>>(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
// The platform organisation's id, a literal because vi.mock is hoisted above the constants (the real
// isPlatformOrganisation runs against it).
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/overview/overview-service', () => ({
  countPlatformOperators: () => countPlatformOperators(),
  countTenantsInStatus: (status: string) => countTenantsInStatus(status),
  listTenantsInStatus: (status: string, size: number) => listTenantsInStatus(status, size),
}));

const { default: PlatformOverviewPage } = await import('./page');

const tenant = (
  id: string,
  displayName: string,
  status: TenantSummary['status'],
  createdAt: string,
): TenantSummary => ({
  id,
  tenantCode: displayName.toLowerCase().replace(/\s+/g, '-'),
  displayName,
  countryCode: 'KE',
  status,
  createdAt,
});

const HARAMBEE = tenant(
  '16000000-0000-4000-8000-000000000002',
  'Harambee Farmers SACCO',
  'PENDING_APPROVAL',
  '2026-09-04T08:00:00Z',
);
const MWANGAZA = tenant(
  '16000000-0000-4000-8000-000000000003',
  'Mwangaza Savings SACCO',
  'PENDING_APPROVAL',
  '2026-09-05T08:00:00Z',
);
const UMOJA = tenant(
  '16000000-0000-4000-8000-000000000001',
  'Umoja Teachers SACCO',
  'DRAFT',
  '2026-09-06T08:00:00Z',
);

function page(items: TenantSummary[], totalItems = items.length): Page<TenantSummary> {
  return {
    items,
    page: {
      number: 0,
      size: ATTENTION_PREVIEW_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / ATTENTION_PREVIEW_SIZE),
      hasNext: totalItems > ATTENTION_PREVIEW_SIZE,
      hasPrevious: false,
    },
  };
}

interface Reads {
  permissions?: string[];
  /** The platform organisation is in this total (BG-29): 3 means two institutions. */
  active?: number | Error;
  suspended?: number | Error;
  pending?: Page<TenantSummary> | Error;
  drafts?: Page<TenantSummary> | Error;
  operators?: number | Error;
}

function settled<T>(value: T | Error): Promise<T> {
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

/** Programs the profile and the five reads; an `Error` rejects its read. */
function setup({
  permissions = ['tenant.view', 'user.view'],
  active = 3,
  suspended = 0,
  pending = page([]),
  drafts = page([]),
  operators = 1,
}: Reads = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: {
      branch: null,
      module: { id: 'platform-administration', name: 'Platform Administration' },
      organization: { id: PLATFORM, name: 'Finaxis Platform' },
    },
  });
  countTenantsInStatus.mockImplementation((status) =>
    settled(status === 'ACTIVE' ? active : suspended),
  );
  listTenantsInStatus.mockImplementation((status) =>
    settled(status === 'PENDING_APPROVAL' ? pending : drafts),
  );
  countPlatformOperators.mockImplementation(() => settled(operators));
}

async function show() {
  return renderWithProviders(await PlatformOverviewPage());
}

const tile = (name: string) => within(screen.getByRole('group', { name }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('PlatformOverviewPage', () => {
  it('counts institutions by lifecycle, leaving out the platform organisation', async () => {
    setup({
      active: 3,
      suspended: 1,
      pending: page([HARAMBEE, MWANGAZA]),
      drafts: page([UMOJA]),
      operators: 2,
    });

    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Platform overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText(OVERVIEW_DESCRIPTION)).toBeInTheDocument();
    // Three ACTIVE rows hold the platform organisation once: two institutions.
    expect(tile('Active institutions').getByText('2')).toBeInTheDocument();
    expect(tile('Pending approval').getByText('2')).toBeInTheDocument();
    expect(tile('Drafts').getByText('1')).toBeInTheDocument();
    expect(tile('Suspended').getByText('1')).toBeInTheDocument();
    expect(tile('Platform operators').getByText('2')).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(5);
    expect(listTenantsInStatus).toHaveBeenCalledWith('PENDING_APPROVAL', 5);
    expect(listTenantsInStatus).toHaveBeenCalledWith('DRAFT', 5);
    expect(countTenantsInStatus).toHaveBeenCalledWith('ACTIVE');
    expect(countTenantsInStatus).toHaveBeenCalledWith('SUSPENDED');
    expect(countPlatformOperators).toHaveBeenCalledTimes(1);
    // The old cards are gone: the count and the destination now sit on each tile.
    expect(screen.queryByText('Active platform context')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open SACCO institutions' })).toBeNull();
    expect(screen.getByRole('link', { name: 'View active institutions' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?status=ACTIVE',
    );
  });

  it('lists pending approval, then drafts, oldest first, without the platform organisation', async () => {
    // A draft read that holds the platform organisation (it never should: only ACTIVE does, BG-29),
    // with a total that counts what is shown, so the filter alone decides the table.
    setup({
      pending: page([HARAMBEE, MWANGAZA]),
      drafts: page([UMOJA, tenant(PLATFORM, 'Platform', 'DRAFT', '2026-09-07T08:00:00Z')], 1),
    });

    await show();

    const rows = within(screen.getByRole('table', { name: 'Institutions needing attention' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Harambee Farmers SACCO',
      'Mwangaza Savings SACCO',
      'Umoja Teachers SACCO',
    ]);
    expect(screen.queryByRole('link', { name: 'Platform' })).toBeNull();
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Needs attention table' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
  });

  it('links to the whole list when the preview holds less', async () => {
    const shown = Array.from({ length: ATTENTION_PREVIEW_SIZE }, (_, index) =>
      tenant(
        `16000000-0000-4000-8000-00000000010${index}`,
        `Pending SACCO ${index + 1}`,
        'PENDING_APPROVAL',
        '2026-09-04T08:00:00Z',
      ),
    );
    setup({ pending: page(shown, 7) });

    await show();

    // Five shown of seven: the tile counts all seven, and the card says there are more.
    expect(tile('Pending approval').getByText('7')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all 7 institutions pending approval' }),
    ).toHaveAttribute('href', PENDING_HREF);
    expect(screen.queryByRole('link', { name: /^View all \d+ drafts?$/ })).toBeNull();
  });

  it("shows each tile's failure on its own", async () => {
    setup({
      active: 3,
      suspended: new BackendApiError(503, { requestId: 'req-9' }),
      pending: page([HARAMBEE, MWANGAZA]),
      drafts: page([UMOJA]),
      operators: 2,
    });

    await show();

    const suspended = tile('Suspended');
    expect(suspended.getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(suspended.getByText('Reference: req-9')).toBeInTheDocument();
    expect(suspended.queryByText('0')).toBeNull();
    // Only that tile degrades: the other four keep their numbers.
    expect(tile('Active institutions').getByText('2')).toBeInTheDocument();
    expect(tile('Pending approval').getByText('2')).toBeInTheDocument();
    expect(tile('Drafts').getByText('1')).toBeInTheDocument();
    expect(tile('Platform operators').getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText(KPI_UNAVAILABLE)).toHaveLength(1);
    // Needs attention still lists what loaded.
    expect(screen.getByRole('link', { name: 'Harambee Farmers SACCO' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the failed count of an institution tile and of the operators tile on their own', async () => {
    setup({
      active: new BackendApiError(500, { requestId: 'req-a' }),
      operators: new BackendApiError(502, { requestId: 'req-o' }),
      suspended: 4,
    });

    await show();

    expect(tile('Active institutions').getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(tile('Active institutions').getByText('Reference: req-a')).toBeInTheDocument();
    expect(tile('Platform operators').getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(tile('Platform operators').getByText('Reference: req-o')).toBeInTheDocument();
    expect(tile('Suspended').getByText('4')).toBeInTheDocument();
    // An empty, loaded pair of previews is still known to be empty.
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
  });

  it('never reads a failed half of Needs attention as nothing', async () => {
    setup({
      pending: page([]),
      drafts: new BackendApiError(503, { requestId: 'req-d' }),
    });

    await show();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Drafts couldn't be loaded. Reference: req-d",
    );
    // Only what is known: nobody is waiting for approval, and nothing is said about drafts.
    expect(screen.getByText('No institution is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs attention')).toBeNull();
    expect(screen.queryByText('There are no drafts')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    const drafts = tile('Drafts');
    expect(drafts.getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(drafts.getByText('Reference: req-d')).toBeInTheDocument();
    expect(drafts.queryByText('0')).toBeNull();
    // The half that did load keeps its tile.
    expect(tile('Pending approval').getByText('0')).toBeInTheDocument();
  });

  it('shows only the operators tile to a holder of user.view alone', async () => {
    setup({ permissions: ['user.view'], operators: 2 });

    await show();

    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(tile('Platform operators').getByText('2')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('Nothing needs attention')).toBeNull();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
    expect(listTenantsInStatus).not.toHaveBeenCalled();
  });

  it('shows the four institution tiles and Needs attention, without operators, to a holder of tenant.view alone', async () => {
    setup({ permissions: ['tenant.view'], pending: page([HARAMBEE]) });

    await show();

    expect(screen.getAllByRole('group')).toHaveLength(4);
    expect(screen.queryByRole('group', { name: 'Platform operators' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Harambee Farmers SACCO' })).toBeInTheDocument();
    expect(countPlatformOperators).not.toHaveBeenCalled();
  });

  it('shows the permission state without either view code', async () => {
    setup({ permissions: [] });

    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByRole('group')).toBeNull();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
    expect(listTenantsInStatus).not.toHaveBeenCalled();
    expect(countPlatformOperators).not.toHaveBeenCalled();
  });

  it("shows a refused count as couldn't be loaded, never hiding its tile", async () => {
    setup({
      suspended: new BackendApiError(403, { requestId: 'req-f' }),
      operators: new BackendApiError(403, { requestId: 'req-g' }),
    });

    await show();

    // A 403 while the view code is held is a failed read (Ruling 9): the tile stays and says so.
    expect(screen.getAllByRole('group')).toHaveLength(5);
    expect(tile('Suspended').getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(tile('Suspended').getByText('Reference: req-f')).toBeInTheDocument();
    expect(tile('Platform operators').getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(tile('Platform operators').getByText('Reference: req-g')).toBeInTheDocument();
  });

  // AGENTS.md: a page settles a read with load(), which redirects on a lost session or a stale
  // context. A tile that swallowed it would show "Couldn't be loaded" on a page that can't recover.
  describe.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('when a read fails with %s', (_name, failure, to) => {
    it.each(['active', 'suspended', 'pending', 'drafts', 'operators'] as const)(
      'redirects, rendering nothing, from the %s read',
      async (read) => {
        setup({ [read]: failure });

        await expect(PlatformOverviewPage()).rejects.toThrow(`NEXT_REDIRECT:${to}`);

        expect(redirect).toHaveBeenCalledWith(to);
      },
    );
  });
});
