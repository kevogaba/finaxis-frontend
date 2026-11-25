import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import {
  SELF_APPROVAL_NOTE_BRANCHES,
  type SwitchState,
} from '@/modules/administration/approvals/maker-checker';
import { MAKER_CHECKER_BLOCKED } from '@/modules/administration/branches/branch-rules';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

const { getBranch, getCurrentContextProfile, readMakerCheckerSwitch, redirect, router } =
  vi.hoisted(() => ({
    getBranch: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    readMakerCheckerSwitch: vi.fn(),
    redirect: vi.fn(),
    // One stable router object, as in table-pagination-bar.test.tsx.
    router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => redirect(to) as unknown,
  usePathname: () => '/admin/branches/08000000-0000-4000-8000-000000000006',
  useRouter: () => router,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => getBranch(...args) as unknown,
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  readMakerCheckerSwitch: (...args: unknown[]) => readMakerCheckerSwitch(...args) as unknown,
}));
// The hero's dialogs import the Server Actions; nothing here submits one.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  activateBranch: vi.fn(),
  closeBranch: vi.fn(),
  discardBranch: vi.fn(),
  reactivateBranch: vi.fn(),
  returnBranch: vi.fn(),
  submitBranch: vi.fn(),
  suspendBranch: vi.fn(),
}));

const { default: BranchRecordLayout } = await import('./layout');

const BRANCH = '08000000-0000-4000-8000-000000000006';
const ME = '10000000-0000-4000-8000-0000000000aa'; // the signed-in administrator
const ORG = '55555555-5555-4555-8555-555555555555';
const VICTOR = '10000000-0000-4000-8000-000000000001';
const ALL_CODES = ['branch.view', 'branch.approve', 'settings.view'];

/** Programs every service the layout reads: a branch awaiting approval, which Activate is on offer
 * for, drafted by `maker` (`created_by`, BG-08) and submitted by `submitter`. */
function setup({
  maker = null,
  submitter = null,
  switchState = 'on',
  status = 'PENDING_APPROVAL',
  codes = ALL_CODES,
  branchOnly = [],
  heldAt = ['b-1'],
  selected = null,
  branch = {},
}: {
  maker?: string | null;
  submitter?: string | null;
  switchState?: SwitchState;
  status?: string;
  codes?: readonly string[];
  /** Of `codes`, the ones held only through BRANCH grants (BG-33), at `heldAt`. */
  branchOnly?: string[];
  heldAt?: string[];
  selected?: { id: string; name: string } | null;
  branch?: { branchCode?: string; statusReason?: string | null };
} = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      // `/auth/me`'s effective set: a branch grant counts only while its branch is selected.
      permissions: codes.filter(
        (code) => !branchOnly.includes(code) || heldAt.includes(selected?.id ?? ''),
      ),
      permission_scopes: permissionScopes(codes, branchOnly, heldAt),
      user_id: ME,
      branches: [],
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: selected },
  });
  getBranch.mockResolvedValue({
    id: BRANCH,
    branchCode: 'LIK',
    branchName: 'Likoni',
    branchType: 'BRANCH',
    status,
    statusReason: null,
    createdBy: maker === null ? null : { id: maker, displayName: null },
    submittedBy: submitter === null ? null : { id: submitter, displayName: null },
    ...branch,
  });
  readMakerCheckerSwitch.mockResolvedValue(switchState);
}

const params = () => Promise.resolve({ branchId: BRANCH });
const activate = () => screen.queryByRole('button', { name: 'Activate' });
const show = async () =>
  renderWithProviders(await BranchRecordLayout({ children: <p>Tab body</p>, params: params() }));

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('BranchRecordLayout: maker-checker (BG-08, decision Q4)', () => {
  it("disables Activate for the branch's drafter while maker-checker is on, with the reason", async () => {
    setup({ maker: ME });
    await show();

    expect(readMakerCheckerSwitch).toHaveBeenCalledExactlyOnceWith(
      'branch_creation',
      expect.objectContaining({ tenantPermissions: ALL_CODES }),
    );
    expect(activate()).toBeDisabled();
    expect(activate()).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
  });

  it('lets the drafter activate while maker-checker is off, saying so above the actions', async () => {
    setup({ maker: ME, switchState: 'off' });
    await show();

    expect(activate()).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(SELF_APPROVAL_NOTE_BRANCHES);
  });

  it('leaves Activate enabled for the drafter when the switch can’t be read', async () => {
    setup({ maker: ME, switchState: 'unknown' });
    await show();

    expect(activate()).toBeEnabled();
    expect(screen.queryByText(MAKER_CHECKER_BLOCKED)).not.toBeInTheDocument();
    expect(screen.queryByText(SELF_APPROVAL_NOTE_BRANCHES)).not.toBeInTheDocument();
  });

  it.each([
    ['someone else drafted it', { maker: VICTOR }],
    // The tenant route refuses its creator, never its submitter.
    ['the caller only submitted it', { maker: VICTOR, submitter: ME }],
    ['the record names no drafter', {}],
  ])('leaves Activate enabled, reading no switch, when %s', async (_case, makers) => {
    setup(makers);
    await show();

    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(activate()).toBeEnabled();
    expect(screen.getByText('Tab body')).toBeInTheDocument();
  });
});

describe('BranchRecordLayout: whichever branch is selected (BG-03)', () => {
  const WESTLANDS = { id: '08000000-0000-4000-8000-000000000009', name: 'Westlands' };

  it('offers a tenant-wide approver Activate with another branch selected', async () => {
    setup({ maker: VICTOR, selected: WESTLANDS });
    await show();

    expect(activate()).toBeEnabled();
  });

  it('answers an unknown branch with not-found, with a branch selected too', async () => {
    setup({ selected: WESTLANDS });
    getBranch.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  // A branch-scoped caller gets 403, never 404, for a branch its grants don't cover.
  it('shows the Forbidden state, under the page h1, when the branch answers 403', async () => {
    setup({ selected: WESTLANDS });
    getBranch.mockRejectedValue(new BackendApiError(403, { code: 'forbidden' }));
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Branch record' })).toBeInTheDocument();
    expect(screen.getByText("You don't have access to this branch.")).toBeInTheDocument();
    expect(screen.queryByText('Tab body')).toBeNull();
  });

  // The route's own gate reads the selected context's grants, and the service checks the target,
  // whichever branch is selected: one role at this branch and Westlands acts here from Westlands.
  it.each([
    ['held here and at the selected branch', [BRANCH, WESTLANDS.id], WESTLANDS, true],
    ['held here, selected', [BRANCH], { id: BRANCH, name: 'Likoni' }, true],
    ['held only at the selected branch', [WESTLANDS.id], WESTLANDS, false],
    ['held here, at All branches', [BRANCH, WESTLANDS.id], null, false],
  ])('offers a branch-scoped Suspend %s: %s', async (_case, heldAt, selected, offered) => {
    setup({
      status: 'ACTIVE',
      codes: ['branch.view', 'branch.suspend'],
      branchOnly: ['branch.view', 'branch.suspend'],
      heldAt,
      selected,
    });
    await show();

    expect(screen.queryByRole('button', { name: 'Suspend' }) !== null).toBe(offered);
  });

  // #242: a branch-scope grant counts only while its branch is ACTIVE.
  it('offers a branch-scoped Reactivate on a suspended branch: never', async () => {
    setup({
      status: 'SUSPENDED',
      codes: ['branch.view', 'branch.reactivate'],
      branchOnly: ['branch.view', 'branch.reactivate'],
      heldAt: [BRANCH, WESTLANDS.id],
      selected: WESTLANDS,
    });
    await show();

    expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
  });
});

describe('BranchRecordLayout: sending a request back (BG-01)', () => {
  const MAKER_CODES = ['branch.view', 'branch.create', 'branch.approve'];
  const button = (name: string) => screen.queryByRole('button', { name });

  it.each([
    ['its creator', 'Withdraw', 'Return for changes', { maker: ME }],
    ['its latest submitter', 'Withdraw', 'Return for changes', { maker: VICTOR, submitter: ME }],
    ['anyone else', 'Return for changes', 'Withdraw', { maker: VICTOR, submitter: VICTOR }],
  ])('offers %s of a pending branch %s, never %s', async (_case, shown, hidden, makers) => {
    setup({ ...makers, codes: MAKER_CODES });
    await show();

    expect(button(shown)).toBeEnabled();
    expect(button(hidden)).not.toBeInTheDocument();
  });

  // Platform #242: a branch-scope grant counts only while its branch is ACTIVE, so a pending or
  // draft branch is withdrawn, returned or discarded tenant-wide only (`canActOnBranch`), even
  // were it the selected branch.
  it.each([
    ['Withdraw', 'PENDING_APPROVAL', ME],
    ['Return for changes', 'PENDING_APPROVAL', VICTOR],
    ['Discard draft', 'DRAFT', ME],
  ])('offers a branch-scoped holder no %s on a %s branch', async (name, status, maker) => {
    setup({
      maker,
      status,
      codes: MAKER_CODES,
      branchOnly: ['branch.create', 'branch.approve'],
      selected: { id: BRANCH, name: 'Likoni' },
    });
    await show();

    expect(button(name)).not.toBeInTheDocument();
  });

  it('offers Discard draft on a draft, but not on the head office', async () => {
    setup({ codes: MAKER_CODES, status: 'DRAFT' });
    const { unmount } = await show();
    expect(button('Discard draft')).toBeEnabled();
    unmount();

    setup({ codes: MAKER_CODES, status: 'DRAFT', branch: { branchCode: 'HEAD_OFFICE' } });
    await show();
    expect(button('Submit for approval')).toBeEnabled();
    expect(button('Discard draft')).not.toBeInTheDocument();
  });

  it('says why a returned draft came back under its title', async () => {
    setup({ status: 'DRAFT', branch: { statusReason: 'Fix the parent branch' } });
    await show();

    expect(screen.getByText('LIK · Branch · Sent back: Fix the parent branch')).toBeInTheDocument();
  });

  it('keeps the plain subtitle for a fresh draft', async () => {
    setup({ status: 'DRAFT' });
    await show();

    expect(screen.getByText('LIK · Branch')).toBeInTheDocument();
  });
});

describe('BranchRecordLayout: Edit (BG-13)', () => {
  const edit = () => screen.queryByRole('link', { name: 'Edit' });
  const codes = ['branch.view', 'branch.update'];

  it.each(['ACTIVE', 'DRAFT'])(
    'links a %s branch to its edit page with branch.update',
    async (status) => {
      setup({ codes, status });
      await show();

      expect(edit()).toHaveAttribute('href', `/admin/branches/${BRANCH}/edit`);
    },
  );

  it('offers no Edit in any other state, or without branch.update', async () => {
    setup({ codes, status: 'SUSPENDED' });
    const { unmount } = await show();
    expect(edit()).not.toBeInTheDocument();
    unmount();

    setup({ codes: ['branch.view'], status: 'ACTIVE' });
    await show();
    expect(edit()).not.toBeInTheDocument();
  });

  // BG-03: the route's gate reads the selected context, the service the grant at the target.
  const scoped = { codes, branchOnly: codes, heldAt: [BRANCH] };
  const here = { id: BRANCH, name: 'Likoni' };

  it('links an ACTIVE branch for a branch-scoped editor with that branch selected', async () => {
    setup({ ...scoped, status: 'ACTIVE', selected: here });
    await show();

    expect(edit()).toHaveAttribute('href', `/admin/branches/${BRANCH}/edit`);
  });

  it('offers a branch-scoped editor no Edit at All branches, nor on a draft', async () => {
    setup({ ...scoped, status: 'ACTIVE', selected: null });
    const { unmount } = await show();
    expect(edit()).not.toBeInTheDocument();
    unmount();

    // A branch-scope grant never reaches a draft (#242), even with that branch selected.
    setup({ ...scoped, status: 'DRAFT', selected: here });
    await show();
    expect(edit()).not.toBeInTheDocument();
  });
});
