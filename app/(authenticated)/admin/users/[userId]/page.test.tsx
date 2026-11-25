import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { permissionScopes } from '@/test/permission-scopes';
import { renderWithProviders } from '@/test/test-utils';

const {
  countUserBranchAssignments,
  countUserRoleAssignments,
  getBranchIndex,
  getCurrentContextProfile,
  getMembership,
  getUser,
} = vi.hoisted(() => ({
  countUserBranchAssignments: vi.fn(),
  countUserRoleAssignments: vi.fn(),
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  // Not the zone vitest.config.mts pins for the runner (Africa/Nairobi), and with no daylight
  // saving, so only the organisation's own zone can produce the times asserted below.
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
  getBranchIndex: () => getBranchIndex() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  countUserBranchAssignments: (...args: unknown[]) =>
    countUserBranchAssignments(...args) as unknown,
  countUserRoleAssignments: (...args: unknown[]) => countUserRoleAssignments(...args) as unknown,
  getMembership: (...args: unknown[]) => getMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
}));

const { default: UserOverviewPage } = await import('./page');

const FELIX = '10000000-0000-4000-8000-00000000000d';
const EMAIL = 'felix.omondi@greenfield.example';
const MEMBERSHIP = '10000000-0000-4000-8000-00000000000e';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const UNKNOWN_BRANCH = '99999999-9999-4999-8999-999999999999';
const ALL_CODES = ['membership.view', 'role_assignment.view', 'branch_assignment.view'];
const without = (...codes: string[]) => ALL_CODES.filter((code) => !codes.includes(code));

interface Setup {
  permissions?: string[];
  /** Of `permissions`, the ones held only at one branch (BG-33). */
  branchOnly?: string[];
  /** Codes held only at a branch that isn't selected (All branches, say): in `/auth/me`'s scopes,
   * not its `permissions`. */
  elsewhere?: string[];
  selectedBranch?: { id: string; name: string } | null;
  membershipStatus?: string;
  userStatus?: string;
  /** What the membership read (by the user read's id) settles with; an Error rejects it. */
  detail?: Record<string, unknown> | Error;
  /** The role count read: the count, or an Error that rejects it. */
  roleCount?: number | Error;
  /** The branch count read (`size=1`'s total): the count, or an Error that rejects it. */
  branchCount?: number | Error;
}

const DETAIL = {
  id: MEMBERSHIP,
  type: 'STAFF',
  status: 'ACTIVE',
  primaryBranchId: WESTLANDS,
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-02T09:30:00Z',
};

/** Programs every service the Overview reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  branchOnly = [],
  elsewhere = [],
  selectedBranch = null,
  membershipStatus = 'ACTIVE',
  userStatus = 'ACTIVE',
  detail = DETAIL,
  roleCount = 2,
  branchCount = 3,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      permissions,
      permission_scopes: [
        ...permissionScopes(permissions, branchOnly),
        ...permissionScopes(elsewhere, elsewhere),
      ],
    },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: selectedBranch },
  });
  getUser.mockResolvedValue({
    id: FELIX,
    username: 'felix.omondi',
    email: EMAIL,
    displayName: 'Felix Omondi',
    membershipStatus,
    userStatus,
    membershipId: MEMBERSHIP,
  });
  if (detail instanceof Error) getMembership.mockRejectedValue(detail);
  else getMembership.mockResolvedValue(detail);
  if (roleCount instanceof Error) countUserRoleAssignments.mockRejectedValue(roleCount);
  else countUserRoleAssignments.mockResolvedValue(roleCount);
  if (branchCount instanceof Error) countUserBranchAssignments.mockRejectedValue(branchCount);
  else countUserBranchAssignments.mockResolvedValue(branchCount);
  getBranchIndex.mockResolvedValue(
    new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]]),
  );
}

async function show(userId = FELIX) {
  const element = await UserOverviewPage({ params: Promise.resolve({ userId }) });
  if (!element) throw new Error('The page rendered nothing');
  return renderWithProviders(element);
}

const card = (name: string) => screen.getByRole('region', { name });

/** The value cell of a description-list row in one card, found by its label. */
function fact(region: HTMLElement, label: string): HTMLElement {
  const value = within(region).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}
const hasFact = (region: HTMLElement, label: string) =>
  within(region).queryByText(label, { selector: 'dt' }) !== null;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UserOverviewPage: the record', () => {
  it('renders nothing when the record itself failed (the layout shows that failure)', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));

    expect(await UserOverviewPage({ params: Promise.resolve({ userId: FELIX }) })).toBeNull();
    expect(getMembership).not.toHaveBeenCalled();
  });
});

describe('UserOverviewPage: the profile', () => {
  it("lists the person's facts, each in its own row", async () => {
    setup();

    await show();

    expect(fact(card('Profile'), 'Display name')).toHaveTextContent('Felix Omondi');
    expect(fact(card('Profile'), 'Username')).toHaveTextContent('felix.omondi');
    expect(fact(card('Profile'), 'Email')).toHaveTextContent(EMAIL);
    expect(fact(card('Profile'), 'User status')).toHaveTextContent('Active');
    // The id is shortened, with a copy control that names what it copies.
    expect(fact(card('Profile'), 'User ID')).toHaveTextContent('10000000');
    expect(
      within(fact(card('Profile'), 'User ID')).getByRole('button', { name: 'Copy User ID' }),
    ).toBeInTheDocument();
  });

  it('words the account status in full in the Profile, never "Provisioning idp"', async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP' });

    await show();

    expect(fact(card('Profile'), 'User status')).toHaveTextContent(/^Provisioning identity$/);
    expect(screen.queryByText(/provisioning idp/i)).not.toBeInTheDocument();
  });

  it('shows the role count only with role_assignment.view, and reads it only then', async () => {
    setup({ roleCount: 2 });
    const { unmount } = await show();

    expect(countUserRoleAssignments).toHaveBeenCalledWith(FELIX);
    expect(fact(card('Profile'), 'Role assignments')).toHaveTextContent(/^2$/);
    unmount();

    vi.resetAllMocks();
    setup({ permissions: without('role_assignment.view') });
    await show();

    expect(hasFact(card('Profile'), 'User status')).toBe(true); // it did render
    expect(hasFact(card('Profile'), 'Role assignments')).toBe(false);
    expect(countUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('shows a user with no roles as a count of 0, not as a missing row', async () => {
    setup({ roleCount: 0 });

    await show();

    expect(countUserRoleAssignments).toHaveBeenCalledWith(FELIX);
    expect(fact(card('Profile'), 'Role assignments')).toHaveTextContent(/^0$/);
  });

  it("keeps the row and says the count couldn't be loaded when its read failed (1a)", async () => {
    setup({ roleCount: new BackendApiError(500, { requestId: 'req-roles' }) });

    await show();

    // A failure is not "not permitted": the holder has the code, so the row stays, with its reference
    // and none of the backend's own text.
    const value = fact(card('Profile'), 'Role assignments');
    expect(value).toHaveTextContent(/^Couldn't be loaded/);
    expect(within(value).getByText('Reference: req-roles')).toBeInTheDocument();
    expect(value).not.toHaveTextContent(/^\d/);
  });

  it('leaves the role row out, with no failure shown, for a holder without role_assignment.view (1a)', async () => {
    setup({ permissions: without('role_assignment.view') });

    await show();

    expect(hasFact(card('Profile'), 'Role assignments')).toBe(false);
    expect(screen.queryByText(/couldn't be loaded/i)).not.toBeInTheDocument();
  });
});

describe('UserOverviewPage: the branch assignment count', () => {
  // BG-09: one `size=1` read by user, whose total is the count: no scan, so never partial.
  it("is the read's total at institution level", async () => {
    setup({ branchCount: 3 });

    await show();

    expect(countUserBranchAssignments).toHaveBeenCalledWith(FELIX);
    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(/^3$/);
  });

  it('shows a user with no branch as a count of 0', async () => {
    setup({ branchCount: 0 });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(/^0$/);
  });

  // BG-03: a search by user ignores the selected branch.
  it('counts every branch for a tenant-wide view, whichever branch is selected', async () => {
    setup({ branchCount: 2, selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(/^2$/);
  });

  it('says a branch-scoped view counts only the branches it covers', async () => {
    setup({ branchCount: 2, branchOnly: ['branch_assignment.view'] });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(
      /^2 at branches you can view$/,
    );
  });

  // BG-03: the search by user answers with every branch a grant covers, at All branches too.
  it('counts a branch-scoped view held at a branch that is not selected, saying so', async () => {
    setup({
      permissions: without('branch_assignment.view'),
      elsewhere: ['branch_assignment.view'],
      branchCount: 1,
    });

    await show();

    expect(countUserBranchAssignments).toHaveBeenCalledWith(FELIX);
    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(
      /^1 at branches you can view$/,
    );
  });

  it("keeps the row and says the count couldn't be loaded when its read failed (1a)", async () => {
    setup({ branchCount: new BackendApiError(500, { requestId: 'req-branches' }) });

    await show();

    const value = fact(card('Profile'), 'Branch assignments');
    expect(value).toHaveTextContent(/^Couldn't be loaded/);
    expect(within(value).getByText('Reference: req-branches')).toBeInTheDocument();
    expect(value).not.toHaveTextContent(/^\d/);
  });

  it('shows a failed read on the row even when it is a 403, since the holder has the code', async () => {
    setup({ branchCount: new BackendApiError(403, { code: 'forbidden' }) });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(/^Couldn't be loaded/);
  });

  it('is shown only with branch_assignment.view, and read only then', async () => {
    setup({ permissions: without('branch_assignment.view') });

    await show();

    expect(hasFact(card('Profile'), 'User status')).toBe(true); // it did render
    expect(hasFact(card('Profile'), 'Branch assignments')).toBe(false);
    expect(countUserBranchAssignments).not.toHaveBeenCalled();
  });
});

describe('UserOverviewPage: the membership card', () => {
  it("shows the membership's own facts, in the organisation's time zone", async () => {
    setup();

    await show();

    // BG-09: by the id the user read carries, with no search.
    expect(getMembership).toHaveBeenCalledWith(MEMBERSHIP);
    expect(fact(card('Membership'), 'Membership type')).toHaveTextContent(/^Staff$/);
    expect(fact(card('Membership'), 'Membership status')).toHaveTextContent(/^Active$/);
    expect(fact(card('Membership'), 'Primary branch')).toHaveTextContent(
      /^Westlands Branch \(WESTLANDS\)$/,
    );
    // 08:00Z and 09:30Z, five and a half hours ahead: not the runner's own zone.
    expect(fact(card('Membership'), 'Created (Asia/Kolkata)')).toHaveTextContent(
      /^01 Aug 2026 · 13:30$/,
    );
    expect(fact(card('Membership'), 'Updated (Asia/Kolkata)')).toHaveTextContent(
      /^02 Aug 2026 · 15:00$/,
    );
    expect(
      within(fact(card('Membership'), 'Membership ID')).getByRole('button', {
        name: 'Copy Membership ID',
      }),
    ).toBeInTheDocument();
  });

  it('names a primary branch the index does not know by its short id, and none as None', async () => {
    setup({ detail: { ...DETAIL, primaryBranchId: UNKNOWN_BRANCH } });
    const { unmount } = await show();

    expect(fact(card('Membership'), 'Primary branch')).toHaveTextContent(/^99999999$/);
    unmount();

    vi.resetAllMocks();
    setup({ detail: { ...DETAIL, primaryBranchId: null } });
    await show();

    expect(fact(card('Membership'), 'Primary branch')).toHaveTextContent(/^None$/);
  });

  it("says so, and reads nothing, when the holder can't view memberships", async () => {
    setup({ permissions: without('membership.view') });

    await show();

    expect(
      within(card('Membership')).getByText(
        "You can't view membership details in your current role.",
      ),
    ).toBeInTheDocument();
    expect(getMembership).not.toHaveBeenCalled();
  });

  // BG-33: the platform checks the membership read tenant-wide, so a branch grant would be a 403.
  it('says so, and reads nothing, for membership.view held only at the selected branch', async () => {
    setup({
      branchOnly: ['membership.view'],
      selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
    });

    await show();

    expect(
      within(card('Membership')).getByText(
        "You can't view membership details in your current role.",
      ),
    ).toBeInTheDocument();
    expect(getMembership).not.toHaveBeenCalled();
  });

  it('shows the failure, with its reference, when the membership read fails', async () => {
    setup({ detail: new BackendApiError(500, { requestId: 'req-2' }) });

    await show();

    const membership = card('Membership');
    expect(within(membership).getByText('Something went wrong')).toBeInTheDocument();
    expect(within(membership).getByText('Reference: req-2')).toBeInTheDocument();
    expect(hasFact(card('Membership'), 'Membership type')).toBe(false);
  });
});

describe('UserOverviewPage: the onboarding card', () => {
  it("lists the steps for the user's two statuses", async () => {
    setup({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'DRAFT' });

    await show();

    const steps = within(card('Onboarding')).getByRole('list', { name: 'Onboarding steps' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^1\. Invited.*Done$/),
      expect.stringMatching(/^2\. Approved.*Waiting$/),
      expect.stringMatching(/^3\. Identity provisioned.*Not started$/),
      expect.stringMatching(/^4\. First sign-in.*Not started$/),
    ]);
  });

  it('says why onboarding stopped, instead of listing steps, for a revoked membership', async () => {
    setup({ membershipStatus: 'REVOKED', userStatus: 'ACTIVE' });

    await show();

    const onboarding = card('Onboarding');
    expect(within(onboarding).queryByRole('list')).not.toBeInTheDocument();
    expect(
      within(onboarding).getByText(/The membership is revoked\. This is permanent/),
    ).toBeInTheDocument();
  });
});
