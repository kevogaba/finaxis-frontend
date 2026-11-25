import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendApiError } from '@/auth/backend-api';
import { VERIFIED_ON_APPROVAL } from '@/modules/administration/approvals/approval-checks';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_REQUEST,
} from '@/modules/administration/approvals/approval-copy';
import {
  SELF_APPROVAL_NOTE_BRANCHES,
  type SwitchState,
} from '@/modules/administration/approvals/maker-checker';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

const {
  activatePendingBranch,
  getBranch,
  getCurrentContextProfile,
  readMakerCheckerSwitch,
  redirect,
} = vi.hoisted(() => ({
  activatePendingBranch: vi.fn(),
  getBranch: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  readMakerCheckerSwitch: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
  getBranchIndex: () =>
    Promise.resolve(new Map([[HEAD_OFFICE, { name: 'Head Office', code: 'HQ' }]])),
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  readMakerCheckerSwitch: (...args: unknown[]) => readMakerCheckerSwitch(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => getBranch(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('@/modules/administration/approvals/branch-activation-actions', () => ({
  activatePendingBranch: (...args: unknown[]) => activatePendingBranch(...args) as unknown,
}));

const { default: BranchApprovalPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const KERICHO = 'b2000000-0000-4000-8000-0000000000bb';
const VICTOR = 'c3000000-0000-4000-8000-0000000000cc';
const HEAD_OFFICE = 'd4000000-0000-4000-8000-0000000000dd';
const WESTLANDS = 'e5000000-0000-4000-8000-0000000000ee';
const MARY = 'f6000000-0000-4000-8000-0000000000ff';
const ALL_CODES = ['branch.approve', 'branch.view', 'audit.view', 'settings.view'];

type Actor = { id: string; displayName: string | null } | null;

interface Setup {
  permissions?: string[];
  /** Of `permissions`, the ones held only at one branch (BG-33). */
  branchOnly?: string[];
  status?: string;
  /** The record's `created_by` and `submitted_by` (BG-08). */
  maker?: Actor;
  submitter?: Actor;
  switchState?: SwitchState;
  selectedBranch?: { id: string; name: string } | null;
  parentBranchId?: string | null;
  me?: string;
}

function setup({
  permissions = ALL_CODES,
  branchOnly = [],
  status = 'PENDING_APPROVAL',
  maker = { id: VICTOR, displayName: 'Victor Kamau' },
  submitter = { id: MARY, displayName: 'Mary Wanjiku' },
  switchState = 'on',
  selectedBranch = null,
  parentBranchId = HEAD_OFFICE,
  me = ME,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      user_id: me,
      permissions,
      permission_scopes: permissionScopes(permissions, branchOnly),
      branches: [
        { id: WESTLANDS, status: 'ACTIVE' },
        { id: HEAD_OFFICE, status: 'ACTIVE' },
      ],
    },
    context: {
      organization: { id: 'org-1', name: 'Greenfield Teachers SACCO' },
      branch: selectedBranch,
    },
  });
  getBranch.mockResolvedValue({
    id: KERICHO,
    branchCode: 'KERICHO',
    branchName: 'Kericho Branch',
    branchType: 'BRANCH',
    parentBranchId,
    status,
    timezone: 'Africa/Nairobi',
    openedOn: null,
    closedOn: null,
    statusReason: null,
    createdAt: '2026-09-09T07:00:00Z',
    updatedAt: '2026-09-11T09:00:00Z',
    createdBy: maker,
    submittedBy: submitter,
  });
  readMakerCheckerSwitch.mockResolvedValue(switchState);
}

async function show(branchId = KERICHO) {
  return renderWithProviders(await BranchApprovalPage({ params: Promise.resolve({ branchId }) }));
}

const card = (name: string) => screen.getByRole('region', { name });
function fact(region: HTMLElement, label: string): HTMLElement {
  const value = within(region).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}
const activate = () => screen.queryByRole('button', { name: 'Activate' });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchApprovalPage', () => {
  it('shows the request and the branch under one h1, with Activate on offer at All branches', async () => {
    setup();
    await show(KERICHO.toUpperCase());

    expect(getBranch).toHaveBeenCalledExactlyOnceWith(KERICHO);
    // Someone else's draft: no switch to read.
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Kericho Branch' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(3);
    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('Victor Kamau');
    expect(fact(card('Request'), 'Submitted by')).toHaveTextContent('Mary Wanjiku');
    expect(fact(card('Branch'), 'Parent branch')).toHaveTextContent('Head Office');
    expect(activate()).toBeEnabled();
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent('Passed');
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent(
      'Drafted by Victor Kamau.',
    );
  });

  it.each([
    ['an upper-case drafter', ME.toUpperCase(), ME],
    ['an upper-case profile id', ME, ME.toUpperCase()],
  ])(
    'disables Activate for its drafter while maker-checker is on (%s)',
    async (_case, maker, me) => {
      setup({ maker: { id: maker, displayName: 'Ann Admin' }, me });
      await show();

      expect(readMakerCheckerSwitch).toHaveBeenCalledExactlyOnceWith(
        'branch_creation',
        expect.objectContaining({ tenantPermissions: expect.arrayContaining(['settings.view']) }),
      );
      expect(activate()).toBeDisabled();
      expect(activate()).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
      expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('You (Ann Admin)');
      const check = fact(card('Control checks'), 'Drafted by someone else');
      expect(check).toHaveTextContent('Not met');
      expect(check).toHaveTextContent(MAKER_CHECKER_BLOCKED);
    },
  );

  it('lets its drafter activate while maker-checker is off, saying so first (BG-08)', async () => {
    setup({ maker: { id: ME, displayName: 'Ann Admin' }, switchState: 'off' });
    await show();

    expect(activate()).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(SELF_APPROVAL_NOTE_BRANCHES);
    expect(screen.getByRole('button', { name: 'Activate' })).toHaveAccessibleDescription(
      SELF_APPROVAL_NOTE_BRANCHES,
    );
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent(
      'Not required',
    );
  });

  it('leaves Activate enabled for its drafter when the switch can’t be read (decision Q4)', async () => {
    setup({ maker: { id: ME, displayName: 'Ann Admin' }, switchState: 'unknown' });
    await show();

    expect(activate()).toBeEnabled();
    expect(screen.queryByText(SELF_APPROVAL_NOTE_BRANCHES)).toBeNull();
    const check = fact(card('Control checks'), 'Drafted by someone else');
    expect(check).toHaveTextContent('Checked on approval');
    expect(check).toHaveTextContent(VERIFIED_ON_APPROVAL);
  });

  // The tenant route refuses the creator and editors, not the submitter (BG-08, verified 6a8ea28).
  it('leaves Activate enabled for its submitter, who the tenant route doesn’t refuse', async () => {
    setup({ submitter: { id: ME, displayName: 'Ann Admin' } });
    await show();

    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(activate()).toBeEnabled();
    expect(fact(card('Request'), 'Submitted by')).toHaveTextContent('You (Ann Admin)');
  });

  it('names the drafter from the record without audit.view', async () => {
    setup({ permissions: ['branch.approve', 'branch.view'] });
    await show();

    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('Victor Kamau');
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent('Passed');
    expect(activate()).toBeEnabled();
  });

  it('offers no decision once decided, and links to the branch record', async () => {
    setup({ status: 'ACTIVE' });
    await show();

    expect(activate()).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('Activated: this branch is live.');
    const recordLink = screen.getByRole('link', { name: 'Open the branch record' });
    expect(recordLink).toHaveAttribute('href', `/admin/branches/${KERICHO}`);
    // Underlined, so the link is told apart from the note's text by more than colour (1.4.1).
    expect(recordLink).toHaveClass('MuiLink-underlineAlways');
    expect(screen.queryByRole('region', { name: 'Control checks' })).toBeNull();
  });

  it('offers Activate to a tenant-wide approver with another branch selected (BG-03)', async () => {
    setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
    await show();

    expect(activate()).toBeEnabled();
  });

  // A pending branch grants no branch-scoped permission (platform #242), so only a tenant-wide
  // `branch.approve` activates it, whichever branch is selected.
  it.each(['branch.approve', 'branch.view'])(
    'reads nothing past the profile when %s is held only at a branch, and says why',
    async (scoped) => {
      setup({
        branchOnly: [scoped],
        selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
      });
      await show();

      expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
      expect(getBranch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['at All branches', null],
    ['with a branch selected', { id: WESTLANDS, name: 'Westlands Branch' }],
  ])('answers a branch the backend can’t find %s with not-found', async (_case, selected) => {
    setup({ selectedBranch: selected });
    getBranch.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' }), "You don't have permission"],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-3' }), 'Reference: req-3'],
  ])('tells %s on the branch read apart, under the page h1', async (_case, error, text) => {
    setup();
    getBranch.mockRejectedValue(error);
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Branch approval' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  // Beyond the brief: each case holds every OTHER code, so a gate that checks only one of the two
  // codes still fails one case (7a's review, M1).
  it.each(['branch.approve', 'branch.view'])(
    'reads nothing past the profile without %s, and says why',
    async (missing) => {
      setup({ permissions: ALL_CODES.filter((code) => code !== missing) });
      await show();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Branch approval' }),
      ).toBeInTheDocument();
      expect(screen.getByText(BRANCH_ACTIVATION_FORBIDDEN)).toBeInTheDocument();
      expect(getBranch).not.toHaveBeenCalled();
    },
  );
});

// Beyond the plan's Task 8a list, in the way 7b added to 7a: each pins a wiring of this page that
// 7a's review or 7b's surviving mutants showed unpinned (a lost session swallowed on a read; a
// failed read taken for absence or for a hidden branch; the bar's ids; a time shown as a dash).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('BranchApprovalPage: a failed read is never absence (rule 9)', () => {
  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the branch read finds %s', async (_case, error, to) => {
    setup();
    getBranch.mockRejectedValue(error);
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' }), "You don't have permission"],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-4' }), 'Reference: req-4'],
  ])(
    'tells %s apart with a branch selected, under the page h1 (BG-03)',
    async (_case, error, text) => {
      setup({ selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });
      getBranch.mockRejectedValue(error);
      await show();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Branch approval' }),
      ).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it('shows a dash for a maker the record doesn’t name (the system, or hidden)', async () => {
    setup({ maker: null, submitter: null });
    await show();

    expect(fact(card('Request'), 'Drafted by')).toHaveTextContent('—');
    expect(fact(card('Request'), 'Submitted by')).toHaveTextContent('—');
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(activate()).toBeEnabled();
    expect(fact(card('Control checks'), 'Drafted by someone else')).toHaveTextContent('Passed');
  });
});

describe('BranchApprovalPage: the facts, the links and the bar’s ids', () => {
  it('links back to the queue and names the branch’s code and type under its h1', async () => {
    setup();
    await show();

    expect(screen.getByRole('link', { name: 'Back to branch activation' })).toHaveAttribute(
      'href',
      '/admin/approvals/branches',
    );
    expect(screen.getByText('KERICHO · Branch')).toBeInTheDocument();
  });

  it('shows each fact from its own source, in the organisation’s zone', async () => {
    setup();
    await show();

    const request = card('Request');
    expect(fact(request, 'Request')).toHaveTextContent(BRANCH_REQUEST);
    expect(fact(request, 'Institution')).toHaveTextContent('Greenfield Teachers SACCO');
    const branch = card('Branch');
    expect(fact(branch, 'Branch name')).toHaveTextContent('Kericho Branch');
    expect(fact(branch, 'Branch code')).toHaveTextContent('KERICHO');
    expect(fact(branch, 'Type')).toHaveTextContent('Branch');
    expect(fact(branch, 'Timezone')).toHaveTextContent('Africa/Nairobi');
    expect(fact(branch, 'Created (Asia/Kolkata)')).toHaveTextContent('9 Sep 2026 · 12:30');
    expect(fact(branch, 'Branch ID')).toHaveTextContent('b2000000');
    expect(fact(card('Control checks'), 'Institution is active')).toHaveTextContent(
      'Greenfield Teachers SACCO is active.',
    );
  });

  it.each([
    { parent: 'one the lookup can’t name', parentBranchId: WESTLANDS, shown: 'e5000000' },
    { parent: 'none', parentBranchId: null, shown: '—' },
  ])('shows a parent branch of $parent as $shown', async ({ parentBranchId, shown }) => {
    setup({ parentBranchId });
    await show();

    expect(fact(card('Branch'), 'Parent branch')).toHaveTextContent(shown);
  });

  it.each([
    ['with audit.view', ALL_CODES, true],
    ['without audit.view', ['branch.approve', 'branch.view'], false],
  ])('links the branch’s audit trail %s', async (_case, permissions, linked) => {
    setup({ permissions });
    await show();

    const link = within(card('Request')).queryByRole('link', { name: 'Open the audit trail' });
    if (linked) expect(link).toHaveAttribute('href', `/admin/branches/${KERICHO}/audit`);
    else expect(link).toBeNull();
  });

  it('hands the Activate dialog the branch, the rendered organisation and a minted key', async () => {
    const user = userEvent.setup({ delay: null });
    activatePendingBranch.mockResolvedValue({ ok: true });
    setup();
    await show(KERICHO.toUpperCase());

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('dialog', { name: 'Activate Kericho Branch?' });
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(activatePendingBranch).toHaveBeenCalledTimes(1);
    });
    const sent = activatePendingBranch.mock.calls[0]?.[1] as FormData;
    expect(sent.get('branchId')).toBe(KERICHO);
    expect(sent.get('contextOrganisationId')).toBe('org-1');
    expect(sent.get('idempotencyKey')).toMatch(UUID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch activated');
  });
});
