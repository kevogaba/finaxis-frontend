import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { renderWithProviders } from '@/test/test-utils';

const {
  countUserRoleAssignments,
  findUserMembership,
  getBranchIndex,
  getCurrentContextProfile,
  getMembership,
  getUser,
  listUserBranchAssignments,
} = vi.hoisted(() => ({
  countUserRoleAssignments: vi.fn(),
  findUserMembership: vi.fn(),
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  listUserBranchAssignments: vi.fn(),
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
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
  getBranchIndex: () => getBranchIndex() as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  countUserRoleAssignments: (...args: unknown[]) => countUserRoleAssignments(...args) as unknown,
  findUserMembership: (...args: unknown[]) => findUserMembership(...args) as unknown,
  getMembership: (...args: unknown[]) => getMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
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
  selectedBranch?: { id: string; name: string } | null;
  membershipStatus?: string;
  userStatus?: string;
  /** What the membership lookup settles with; an Error rejects it. */
  membership?: { id: string } | null | Error;
  /** What the membership detail read settles with; an Error rejects it. */
  detail?: Record<string, unknown> | Error;
  roleCount?: number | null;
  /** The branch scan: how many of the user's rows it found, and whether it hit its ceiling. */
  scanRows?: number;
  truncated?: boolean;
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
  selectedBranch = null,
  membershipStatus = 'ACTIVE',
  userStatus = 'ACTIVE',
  membership = { id: MEMBERSHIP },
  detail = DETAIL,
  roleCount = 2,
  scanRows = 3,
  truncated = false,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions },
    context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: selectedBranch },
  });
  getUser.mockResolvedValue({
    id: FELIX,
    username: 'felix.omondi',
    email: EMAIL,
    displayName: 'Felix Omondi',
    membershipStatus,
    userStatus,
  });
  if (membership instanceof Error) findUserMembership.mockRejectedValue(membership);
  else findUserMembership.mockResolvedValue(membership);
  if (detail instanceof Error) getMembership.mockRejectedValue(detail);
  else getMembership.mockResolvedValue(detail);
  countUserRoleAssignments.mockResolvedValue(roleCount);
  listUserBranchAssignments.mockResolvedValue({
    items: Array.from({ length: scanRows }, (_, n) => ({ id: `row-${n}` })),
    truncated,
  });
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
    expect(findUserMembership).not.toHaveBeenCalled();
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

  it('words a user status the way the hero does, never "Provisioning idp"', async () => {
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
});

describe('UserOverviewPage: the branch assignment count', () => {
  it('is the number of rows found at institution level', async () => {
    setup({ scanRows: 3 });

    await show();

    expect(listUserBranchAssignments).toHaveBeenCalledWith(FELIX);
    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(/^3$/);
  });

  it('says it is partial when the scan hit its ceiling, never a bare count', async () => {
    setup({ scanRows: 3, truncated: true });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(
      /^At least 3 \(partial\)$/,
    );
  });

  it('names the selected branch when one is selected', async () => {
    setup({ scanRows: 2, selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(
      /^2 at Westlands Branch$/,
    );
  });

  it('says it is partial in a branch context too, never a bare "0 at" a branch', async () => {
    setup({
      scanRows: 0,
      truncated: true,
      selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
    });

    await show();

    expect(fact(card('Profile'), 'Branch assignments')).toHaveTextContent(
      /^At least 0 at Westlands Branch \(partial\)$/,
    );
    expect(screen.queryByText(/^0 at/)).not.toBeInTheDocument();
  });

  it('is shown only with branch_assignment.view, and the scan is read only then', async () => {
    setup({ permissions: without('branch_assignment.view') });

    await show();

    expect(hasFact(card('Profile'), 'User status')).toBe(true); // it did render
    expect(hasFact(card('Profile'), 'Branch assignments')).toBe(false);
    expect(listUserBranchAssignments).not.toHaveBeenCalled();
  });
});

describe('UserOverviewPage: the membership card', () => {
  it("shows the membership's own facts, in the organisation's time zone", async () => {
    setup();

    await show();

    expect(findUserMembership).toHaveBeenCalledWith(FELIX, EMAIL);
    expect(getMembership).toHaveBeenCalledWith(MEMBERSHIP);
    expect(fact(card('Membership'), 'Membership type')).toHaveTextContent(/^Staff$/);
    expect(fact(card('Membership'), 'Membership status')).toHaveTextContent(/^Active$/);
    expect(fact(card('Membership'), 'Primary branch')).toHaveTextContent(
      /^Westlands Branch \(WESTLANDS\)$/,
    );
    // 08:00Z and 09:30Z, three hours ahead.
    expect(fact(card('Membership'), 'Created (Africa/Nairobi)')).toHaveTextContent(
      /^01 Aug 2026 · 11:00$/,
    );
    expect(fact(card('Membership'), 'Updated (Africa/Nairobi)')).toHaveTextContent(
      /^02 Aug 2026 · 12:30$/,
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
    expect(findUserMembership).not.toHaveBeenCalled();
    expect(getMembership).not.toHaveBeenCalled();
  });

  it('says the membership could not be found, and reads no detail, when the lookup finds none', async () => {
    setup({ membership: null });

    await show();

    const membership = card('Membership');
    expect(
      within(membership).getByText("This user's membership couldn't be found."),
    ).toBeInTheDocument();
    expect(within(membership).queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(getMembership).not.toHaveBeenCalled();
  });

  it('shows the failure, with its reference, when the lookup fails', async () => {
    setup({ membership: new BackendApiError(500, { requestId: 'req-1' }) });

    await show();

    const membership = card('Membership');
    expect(within(membership).getByText('Something went wrong')).toBeInTheDocument();
    expect(within(membership).getByText('Reference: req-1')).toBeInTheDocument();
    expect(within(membership).queryByText(/couldn't be found/)).not.toBeInTheDocument();
    expect(getMembership).not.toHaveBeenCalled();
  });

  it('shows the failure, with its reference, when the membership detail fails', async () => {
    setup({ detail: new BackendApiError(500, { requestId: 'req-2' }) });

    await show();

    const membership = card('Membership');
    expect(within(membership).getByText('Reference: req-2')).toBeInTheDocument();
    expect(within(membership).queryByText(/couldn't be found/)).not.toBeInTheDocument();
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
