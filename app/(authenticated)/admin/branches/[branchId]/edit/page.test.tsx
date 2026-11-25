import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EDIT_DRAFT_WARNING } from '@/modules/administration/branches/branch-rules';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

const { getBranch, getBranchIndex, getCurrentContextProfile, redirect } = vi.hoisted(() => ({
  getBranch: vi.fn(),
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => getBranch(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: () => getBranchIndex() as unknown,
}));
// The form imports the Server Actions; nothing here submits one.
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  createBranchDraft: vi.fn(),
  updateBranch: vi.fn(),
}));

const { default: EditBranchPage } = await import('./page');

const BRANCH = '44444444-4444-4444-8444-444444444444';
const HEAD = '22222222-2222-4222-8222-222222222222';
const CHILD = '55555555-5555-4555-8555-555555555555';
const EDIT_CODES = ['branch.view', 'branch.update'];

function setup({
  status = 'ACTIVE',
  codes = EDIT_CODES,
  branchOnly = [] as string[],
  selected = null as { id: string; name: string } | null,
} = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      // `/auth/me`'s effective set: a branch grant counts only while its branch is selected.
      permissions: codes.filter((code) => !branchOnly.includes(code) || selected?.id === BRANCH),
      permission_scopes: permissionScopes(codes, branchOnly, [BRANCH]),
      user_id: 'me',
    },
    context: { organization: { id: 'org', name: 'Greenfield' }, branch: selected },
  });
  getBranch.mockResolvedValue({
    id: BRANCH,
    branchCode: 'WESTLANDS',
    branchName: 'Westlands Branch',
    branchType: 'OPERATIONS',
    parentBranchId: HEAD,
    status,
    timezone: 'Africa/Nairobi',
    address: { city: 'Nairobi' },
  });
  getBranchIndex.mockResolvedValue(
    new Map([
      [HEAD, { name: 'Head Office', code: 'HEAD_OFFICE', parentId: null, status: 'ACTIVE' }],
      [BRANCH, { name: 'Westlands Branch', code: 'WESTLANDS', parentId: HEAD, status: 'ACTIVE' }],
      [CHILD, { name: 'Westlands Annex', code: 'ANNEX', parentId: BRANCH, status: 'ACTIVE' }],
    ]),
  );
}

const show = async () =>
  renderWithProviders(
    <>{await EditBranchPage({ params: Promise.resolve({ branchId: BRANCH }) })}</>,
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('EditBranchPage (BG-13)', () => {
  it('edits an active branch, offering parents other than itself and those below it', async () => {
    const user = userEvent.setup();
    setup();
    await show();

    expect(screen.getByRole('textbox', { name: 'Branch name' })).toHaveValue('Westlands Branch');
    expect(screen.getByRole('textbox', { name: 'City or town' })).toHaveValue('Nairobi');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.queryByText(EDIT_DRAFT_WARNING)).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Parent branch' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Head Office (HEAD_OFFICE)',
    ]);
  });

  it('warns that editing a draft costs the editor its activation', async () => {
    setup({ status: 'DRAFT' });
    await show();

    expect(screen.getByText(EDIT_DRAFT_WARNING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('says a branch in another state cannot be edited', async () => {
    setup({ status: 'SUSPENDED' });
    await show();

    expect(screen.getByText("This branch can't be edited")).toBeInTheDocument();
    expect(screen.getByText('Only a draft or an active branch can be edited.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('refuses without branch.update, never showing the form', async () => {
    setup({ codes: ['branch.view'] });
    await show();

    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(getBranchIndex).not.toHaveBeenCalled();
  });

  // BG-03: the route's gate reads the selected context, the service the grant at the target.
  describe('a branch-scoped editor', () => {
    const here = { id: BRANCH, name: 'Westlands Branch' };

    it('edits its ACTIVE branch while it is selected, saying the parents are its own', async () => {
      setup({ branchOnly: EDIT_CODES, selected: here });
      await show();

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      expect(screen.getByRole('combobox', { name: 'Parent branch' })).toHaveAccessibleDescription(
        'Optional. Only branches you can view are shown.',
      );
    });

    it('may not edit it at All branches', async () => {
      setup({ branchOnly: EDIT_CODES, selected: null });
      await show();

      expect(screen.getByText("You don't have permission")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    });

    it('may not edit a draft, even selected (#242)', async () => {
      setup({ status: 'DRAFT', branchOnly: EDIT_CODES, selected: here });
      await show();

      expect(screen.getByText("You don't have permission")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    });
  });

  it('renders nothing when the branch read failed: the layout shows why', async () => {
    setup();
    getBranch.mockRejectedValue(new Error('down'));
    const { container } = await show();
    expect(container).toBeEmptyDOMElement();
  });
});
