import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_QUEUE_DESCRIPTION,
  NO_BRANCHES_WAITING,
} from '@/modules/administration/approvals/approval-copy';
import { BRANCH_QUEUE_LABEL } from '@/modules/administration/approvals/approval-rules';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listBranchActivations, redirect } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listBranchActivations: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/approvals/branches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  listBranchActivations: (...args: unknown[]) => listBranchActivations(...args) as unknown,
}));

const { default: BranchActivationPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const KERICHO = 'c1000000-0000-4000-8000-0000000000c1';
const WESTLANDS = 'd2000000-0000-4000-8000-0000000000d2';
const CODES = ['branch.approve', 'branch.view'];

function branches(totalItems: number, number = 0) {
  return {
    items:
      totalItems === 0
        ? []
        : [
            {
              id: KERICHO,
              branchCode: 'KERICHO',
              branchName: 'Kericho Branch',
              branchType: 'BRANCH',
              status: 'PENDING_APPROVAL',
              createdAt: '2026-09-10T20:00:00Z',
            },
          ],
    page: {
      number,
      size: 10,
      totalItems,
      totalPages: Math.ceil(totalItems / 10),
      hasNext: false,
      hasPrevious: number > 0,
    },
  };
}

interface Setup {
  permissions?: string[];
  /** Of `permissions`, the ones held only at one branch (BG-33). */
  branchOnly?: string[];
  selectedBranch?: { id: string; name: string } | null;
}

function setup({ permissions = CODES, branchOnly = [], selectedBranch = null }: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, permission_scopes: permissionScopes(permissions, branchOnly) },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: selectedBranch },
  });
}

const show = async (searchParams: Record<string, string> = {}) =>
  renderWithProviders(await BranchActivationPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchActivationPage', () => {
  it('lists pending branches newest first, linking each to its approval page', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(1));
    await show();

    expect(listBranchActivations).toHaveBeenCalledExactlyOnceWith({
      page: 0,
      size: 10,
      sort: { by: 'createdAt', dir: 'DESC' },
    });
    const card = screen.getByRole('region', { name: BRANCH_QUEUE_LABEL });
    expect(within(card).getByText(BRANCH_QUEUE_DESCRIPTION)).toBeInTheDocument();
    const table = within(card).getByRole('region', { name: 'Branches table' });
    expect(table).toHaveAttribute('tabindex', '0');
    expect(within(table).getByRole('link', { name: 'Kericho Branch' })).toHaveAttribute(
      'href',
      `/admin/approvals/branches/${KERICHO}`,
    );
    // The organisation's zone, not the runner's: 20:00Z is the next day in Kolkata.
    expect(within(table).getByText('11 Sep 2026')).toBeInTheDocument();
    // The pagination bar, from the backend's page.
    expect(within(card).getByText('1–1 of 1')).toBeInTheDocument();
  });

  it('sorts by the URL’s allowed field, and its header links flip the direction within the tab', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(1));
    await show({ sortBy: 'branchName', sortDir: 'ASC', page: '0' });

    expect(listBranchActivations).toHaveBeenCalledWith(
      expect.objectContaining({ sort: { by: 'branchName', dir: 'ASC' } }),
    );
    const header = screen.getByRole('link', { name: 'Branch' });
    expect(header).toHaveAttribute(
      'href',
      '/admin/approvals/branches?sortBy=branchName&sortDir=DESC',
    );
    expect(screen.getByRole('link', { name: 'Code' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches?sortBy=branchCode&sortDir=ASC',
    );
  });

  it('reads the page and the size from the URL', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(45, 2));
    await show({ page: '2', size: '20' });

    expect(listBranchActivations).toHaveBeenCalledExactlyOnceWith({
      page: 2,
      size: 20,
      sort: { by: 'createdAt', dir: 'DESC' },
    });
  });

  // BG-03: a tenant-wide approver activates any branch, whichever branch is selected.
  it('lists pending branches with a branch selected, with no note about it', async () => {
    setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
    listBranchActivations.mockResolvedValue(branches(1));
    await show();

    expect(screen.getByRole('link', { name: 'Kericho Branch' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });

  // A pending branch grants no branch-scoped permission (platform #242).
  it.each(['branch.approve', 'branch.view'])(
    'reads nothing when %s is held only at a branch, and says why',
    async (scoped) => {
      setup({ branchOnly: [scoped], selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
      await show();

      expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
      expect(listBranchActivations).not.toHaveBeenCalled();
    },
  );

  it('says nothing is waiting, never an empty table', async () => {
    setup();
    listBranchActivations.mockResolvedValue(branches(0));
    await show();

    expect(screen.getByText(NO_BRANCHES_WAITING)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Branches table' })).toBeNull();
  });

  it.each([[['branch.approve']], [['branch.view']]])(
    'reads nothing with only %j, and says why',
    async (permissions) => {
      setup({ permissions });
      await show();

      expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
      // The description names a list this holder can't see, so the card leaves it out.
      expect(screen.queryByText(BRANCH_QUEUE_DESCRIPTION)).toBeNull();
      expect(listBranchActivations).not.toHaveBeenCalled();
    },
  );

  it('tells a 403 from a failure, keeping the reference (never an empty queue)', async () => {
    setup();
    listBranchActivations.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    const { unmount } = await show();
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeNull();
    expect(screen.queryByText(BRANCH_QUEUE_DESCRIPTION)).toBeNull();
    unmount();

    listBranchActivations.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-8' }));
    await show();
    expect(screen.getByText('Reference: req-8')).toBeInTheDocument();
    expect(screen.getByText(BRANCH_QUEUE_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(NO_BRANCHES_WAITING)).toBeNull();
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects on %s', async (_case, error, to) => {
    setup();
    listBranchActivations.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it.each([
    ['the size', { page: '4', size: '10' }, '?page=1&size=10'],
    [
      'the sort and the size',
      { sortBy: 'branchName', sortDir: 'ASC', page: '4', size: '10' },
      '?sortBy=branchName&sortDir=ASC&page=1&size=10',
    ],
  ])('sends a page past the end to the last page, keeping %s', async (_case, params, query) => {
    setup();
    listBranchActivations.mockResolvedValue({ ...branches(12, 4), items: [] });
    await expect(show(params)).rejects.toThrow(`NEXT_REDIRECT:/admin/approvals/branches${query}`);
  });
});
