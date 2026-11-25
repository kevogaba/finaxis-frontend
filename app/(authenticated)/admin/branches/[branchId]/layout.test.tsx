import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
  reactivateBranch: vi.fn(),
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
}: {
  maker?: string | null;
  submitter?: string | null;
  switchState?: SwitchState;
} = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      permissions: ALL_CODES,
      permission_scopes: permissionScopes(ALL_CODES),
      user_id: ME,
      branches: [],
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  getBranch.mockResolvedValue({
    id: BRANCH,
    branchCode: 'LIK',
    branchName: 'Likoni',
    branchType: 'BRANCH',
    status: 'PENDING_APPROVAL',
    createdBy: maker === null ? null : { id: maker, displayName: null },
    submittedBy: submitter === null ? null : { id: submitter, displayName: null },
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
