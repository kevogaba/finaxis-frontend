import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { formatBusinessDate, shortId } from '@/lib/format';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { BRANCH_DETAIL_DESCRIPTION } from '@/modules/platform-administration/branches/institution-branch-rules';
import { renderWithProviders } from '@/test/test-utils';

// Lettered, so their upper-case forms differ from them.
const T = '17000000-0000-4000-8000-0000000000ac';
const HEAD = '17000000-0000-4000-8000-0000000000b1';
const B = '17000000-0000-4000-8000-0000000000b2';

const { getInstitutionBranch, getInstitutionBranchIndex, getTenant, redirect } = vi.hoisted(() => ({
  getInstitutionBranch: vi.fn(),
  getInstitutionBranchIndex: vi.fn(),
  getTenant: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
}));
// parseInstitutionId reads the reserved platform organisation from here. A literal, because vi.mock
// is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/branches/institution-branch-service', () => ({
  getInstitutionBranch: (...args: unknown[]) => getInstitutionBranch(...args) as unknown,
  getInstitutionBranchIndex: (...args: unknown[]) => getInstitutionBranchIndex(...args) as unknown,
}));

const { default: InstitutionBranchPage } = await import('./page');

const MOMBASA = {
  id: B,
  branchCode: 'MOMBASA_RD',
  branchName: 'Mombasa Road Branch',
  branchType: 'OPERATIONS',
  parentBranchId: HEAD as string | null,
  status: 'ACTIVE',
  timezone: 'Africa/Nairobi',
  openedOn: null as string | null,
  closedOn: null as string | null,
  statusReason: null as string | null,
  createdAt: '2026-07-10T08:00:00Z',
  updatedAt: '2026-07-24T08:00:00Z',
};

interface Setup {
  branch?: Partial<typeof MOMBASA> | Error;
  /** What the tenant read settles with; an Error rejects it. */
  tenant?: Error;
  /** What the branch index read settles with; an Error rejects it. */
  index?: Error;
}

/** Programs every read the page makes. A test names only what it varies. */
function setup({ branch = {}, tenant, index }: Setup = {}) {
  if (branch instanceof Error) getInstitutionBranch.mockRejectedValue(branch);
  else getInstitutionBranch.mockResolvedValue({ ...MOMBASA, ...branch });
  if (tenant) getTenant.mockRejectedValue(tenant);
  else getTenant.mockResolvedValue({ id: T, tenantCode: 'acme', displayName: 'Acme SACCO' });
  if (index) getInstitutionBranchIndex.mockRejectedValue(index);
  else {
    getInstitutionBranchIndex.mockResolvedValue({
      names: new Map([[HEAD, { name: 'Head Office', code: 'HEAD_OFFICE' }]]),
      truncated: false,
    });
  }
}

async function open(tenantId = T, branchId = B) {
  const element = await InstitutionBranchPage({ params: Promise.resolve({ tenantId, branchId }) });
  // The shell's <main> isn't rendered here; the page's own controls are asserted inside one.
  return renderWithProviders(<main>{element}</main>);
}

/** The value of a fact in the description list, by its label. */
function fact(label: string): HTMLElement {
  const value = screen.getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`No value follows "${label}"`);
  return value;
}

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('InstitutionBranchPage: the record', () => {
  it('shows the branch read-only, in UTC, with its institution and parent', async () => {
    setup();

    await open();

    expect(screen.getByRole('heading', { level: 1, name: 'Mombasa Road Branch' })).toBeVisible();
    expect(screen.getByText('MOMBASA_RD · Acme SACCO')).toBeVisible();
    // The runner's zone is Africa/Nairobi (UTC+3): 08:00 can only come from UTC.
    expect(fact('Created (UTC)')).toHaveTextContent('10 Jul 2026 · 08:00');
    expect(fact('Updated (UTC)')).toHaveTextContent('24 Jul 2026 · 08:00');
    expect(fact('Type')).toHaveTextContent(branchTypeLabel('OPERATIONS'));
    expect(fact('Timezone')).toHaveTextContent('Africa/Nairobi');
    expect(
      within(fact('Parent branch')).getByRole('link', { name: 'Head Office' }),
    ).toHaveAttribute('href', `/platform-admin/tenants/${T}/branches/${HEAD}`);
    expect(within(fact('Institution')).getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}`,
    );
    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/branches`,
    );
    // Nothing to change here: the platform has no branch lifecycle or edit (BG-13).
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Copy Branch ID']);
    expect(screen.queryByText('Opened on')).toBeNull();
    expect(screen.queryByText('Closed on')).toBeNull();
    expect(screen.getByText(BRANCH_DETAIL_DESCRIPTION)).toBeVisible();
    expect(getInstitutionBranch).toHaveBeenCalledWith(T, B);
    expect(getInstitutionBranchIndex).toHaveBeenCalledWith(T);
  });

  it('shows no parent, and reads no branch names, for a top-level branch', async () => {
    setup({ branch: { parentBranchId: null } });

    await open();

    expect(fact('Parent branch')).toHaveTextContent('—');
    expect(within(fact('Parent branch')).queryByRole('link')).toBeNull();
    expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
  });

  it("names the parent by its short id when the branch names couldn't be read", async () => {
    setup({ index: new BackendApiError(500, { requestId: 'req-i' }) });

    await open();

    const parent = within(fact('Parent branch')).getByRole('link', { name: shortId(HEAD) });
    expect(parent).toHaveAttribute('href', `/platform-admin/tenants/${T}/branches/${HEAD}`);
    expect(screen.queryByText('Head Office')).toBeNull();
  });

  it('names the parent by its short id when the index does not hold it', async () => {
    setup({ branch: { parentBranchId: '17000000-0000-4000-8000-0000000000b9' } });

    await open();

    expect(within(fact('Parent branch')).getByRole('link', { name: '17000000' })).toBeVisible();
  });

  it('builds the parent link from the lower-cased id (contract §A)', async () => {
    setup({ branch: { parentBranchId: HEAD.toUpperCase() } });

    await open();

    expect(within(fact('Parent branch')).getByRole('link')).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}/branches/${HEAD}`,
    );
  });

  it("leaves the institution name out when it couldn't be read", async () => {
    setup({ tenant: new BackendApiError(503, { requestId: 'req-t' }) });

    await open();

    // The subtitle and the Branch code fact are the only places the code stands alone.
    expect(screen.getAllByText('MOMBASA_RD')).toHaveLength(2);
    expect(screen.queryByText(/MOMBASA_RD ·/)).toBeNull();
    expect(within(fact('Institution')).getByRole('link', { name: shortId(T) })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${T}`,
    );
    expect(screen.queryByText('Acme SACCO')).toBeNull();
  });

  it('shows opened and closed dates only when present', async () => {
    setup({ branch: { openedOn: '01-08-2026', closedOn: '31-12-2026' } });

    await open();

    expect(fact('Opened on')).toHaveTextContent(formatBusinessDate('01-08-2026', 'short'));
    expect(fact('Closed on')).toHaveTextContent(formatBusinessDate('31-12-2026', 'short'));
  });

  it('shows the last status reason, or a dash when there is none', async () => {
    setup();
    const { unmount } = await open();
    expect(fact('Last status reason')).toHaveTextContent('—');
    unmount();

    setup({ branch: { statusReason: 'Lease ended' } });
    await open();

    expect(fact('Last status reason')).toHaveTextContent('Lease ended');
  });
});

describe('InstitutionBranchPage: failures', () => {
  it('answers a 404 with the not-found page, reading no names', async () => {
    setup({ branch: new BackendApiError(404, { code: 'resource_not_found' }) });

    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getInstitutionBranchIndex).not.toHaveBeenCalled();
  });

  it('answers a 403 with the permission state', async () => {
    setup({ branch: new BackendApiError(403, { code: 'forbidden' }) });

    await open();

    expect(screen.getByRole('heading', { level: 1, name: 'Branch record' })).toBeVisible();
    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(screen.queryByText('Branch details')).toBeNull();
  });

  it('shows any other failure with its reference, never a record', async () => {
    setup({ branch: new BackendApiError(500, { requestId: 'req-r' }) });

    await open();

    expect(screen.getByRole('heading', { level: 1, name: 'Branch record' })).toBeVisible();
    expect(screen.getByText('Reference: req-r')).toBeVisible();
    expect(screen.queryByText("You don't have permission")).toBeNull();
    expect(screen.queryByText('Branch details')).toBeNull();
  });

  // Rule 21: every read is settled with load(), so a lost session or a stale context redirects
  // instead of rendering a record from a dead session.
  it.each([
    ['the branch read', 'branch'],
    ['the institution read', 'tenant'],
    ['the branch names read', 'index'],
  ] as const)('redirects to login when %s finds the session lost', async (_label, which) => {
    setup({ [which]: new BackendApiError(401) });

    await expect(open()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
  });
});
