import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { VERIFIED_ON_APPROVAL } from '@/modules/administration/approvals/approval-checks';
import {
  BRANCHES_CAPPED,
  MEMBERSHIP_NOT_PERMITTED,
  READ_FAILED,
  ROLES_CAPPED,
  USER_APPROVAL_FORBIDDEN,
} from '@/modules/administration/approvals/approval-copy';
import {
  SELF_APPROVAL_NOTE_USERS,
  type SwitchState,
} from '@/modules/administration/approvals/maker-checker';
import {
  accountBlockedNote,
  NO_MEMBERSHIP_VIEW,
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';
import { permissionScopes } from '@/test/permission-scopes';

const {
  getCurrentContextProfile,
  getMembership,
  getUser,
  listRequestedBranches,
  listRequestedRoles,
  readMakerCheckerSwitch,
  redirect,
} = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  listRequestedBranches: vi.fn(),
  listRequestedRoles: vi.fn(),
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
  // Not the runner's zone (Africa/Nairobi), so only the organisation's can produce these times.
  getOrganisationTimeZone: () => Promise.resolve('Asia/Kolkata'),
  getBranchIndex: () =>
    Promise.resolve(new Map([[WESTLANDS, { name: 'Westlands Branch', code: 'WESTLANDS' }]])),
  getRoleIndex: () =>
    Promise.resolve(new Map([[TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE' }]])),
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  listRequestedBranches: (...args: unknown[]) => listRequestedBranches(...args) as unknown,
  listRequestedRoles: (...args: unknown[]) => listRequestedRoles(...args) as unknown,
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  readMakerCheckerSwitch: (...args: unknown[]) => readMakerCheckerSwitch(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getMembership: (...args: unknown[]) => getMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
}));
// The decision bar and the assignment tables import Server Actions; nothing here submits one.
vi.mock('@/modules/administration/approvals/approval-actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}));
vi.mock('@/modules/administration/approvals/branch-activation-actions', () => ({
  activatePendingBranch: vi.fn(),
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));
vi.mock('@/modules/administration/branches/branch-actions', () => ({
  assignBranchUser: vi.fn(),
  returnBranch: vi.fn(),
  revokeBranchAssignment: vi.fn(),
}));

const { default: UserApprovalPage } = await import('./page');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const ROSE = 'b2000000-0000-4000-8000-0000000000bb';
const VICTOR = 'c3000000-0000-4000-8000-0000000000cc';
const MEMBERSHIP = 'd4000000-0000-4000-8000-0000000000dd';
const WESTLANDS = 'e5000000-0000-4000-8000-0000000000ee';
const TELLER = 'f6000000-0000-4000-8000-0000000000ff';
const ALL_CODES = [
  'user.approve',
  'user.view',
  'membership.view',
  'membership.revoke',
  'audit.view',
  'role_assignment.view',
  'branch_assignment.view',
];

interface Setup {
  permissions?: string[];
  membershipStatus?: string;
  userStatus?: string;
  /** The membership read by the record's id: its detail, or an Error that rejects it. */
  membership?: Record<string, unknown> | Error;
  /** The user read's membership type (BG-09). */
  membershipType?: string;
  /** The record's inviter (`created_by`, BG-08): null for the system, or someone hidden. */
  maker?: { id: string; displayName: string | null } | null;
  /** `require_maker_checker_for_user_invites`, as the reader answers it. */
  switchState?: SwitchState;
  roles?: number | Error;
  rolesHasNext?: boolean;
  branches?: number | Error;
  branchesHasNext?: boolean;
  selectedBranch?: { id: string; name: string } | null;
  /** Of `permissions`, the ones held only at one branch (BG-33). */
  branchOnly?: string[];
}

function setup({
  permissions = ALL_CODES,
  membershipStatus = 'PENDING_APPROVAL',
  userStatus = 'DRAFT',
  membership = {
    id: MEMBERSHIP,
    userId: ROSE,
    status: 'PENDING_APPROVAL',
    type: 'STAFF',
    primaryBranchId: WESTLANDS,
  },
  membershipType = 'STAFF',
  maker = { id: VICTOR, displayName: 'Victor Kamau' },
  switchState = 'on',
  roles = 1,
  rolesHasNext = false,
  branches = 1,
  branchesHasNext = false,
  selectedBranch = null,
  branchOnly = [],
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      user_id: ME,
      permissions,
      permission_scopes: permissionScopes(permissions, branchOnly),
      branches: [],
    },
    context: {
      organization: { id: 'org-1', name: 'Greenfield Teachers SACCO' },
      branch: selectedBranch,
    },
  });
  getUser.mockResolvedValue({
    id: ROSE,
    username: 'rose.atieno',
    email: 'rose.atieno@greenfield.example',
    displayName: 'Rose Atieno',
    membershipStatus,
    userStatus,
    membershipId: MEMBERSHIP,
    membershipType,
    createdAt: '2026-07-01T08:00:00Z',
    membershipCreatedAt: '2026-09-24T08:00:00Z',
    createdBy: maker,
  });
  if (membership instanceof Error) getMembership.mockRejectedValue(membership);
  else getMembership.mockResolvedValue(membership);
  readMakerCheckerSwitch.mockResolvedValue(switchState);
  if (roles instanceof Error) listRequestedRoles.mockRejectedValue(roles);
  else {
    listRequestedRoles.mockResolvedValue({
      items: Array.from({ length: roles }, (_, n) => ({
        id: `9${n}000000-0000-4000-8000-000000000000`,
        roleId: TELLER,
        scopeType: 'BRANCH',
        branchId: WESTLANDS,
      })),
      page: {
        number: 0,
        size: 100,
        totalItems: roles,
        totalPages: 1,
        hasNext: rolesHasNext,
        hasPrevious: false,
      },
    });
  }
  if (branches instanceof Error) listRequestedBranches.mockRejectedValue(branches);
  else {
    listRequestedBranches.mockResolvedValue({
      items: Array.from({ length: branches }, (_, n) => ({
        id: `8${n}000000-0000-4000-8000-000000000000`,
        branchId: WESTLANDS,
        assignmentType: 'HOME',
        branchName: 'Westlands Branch',
        assignedAt: '2026-09-24T08:00:00Z',
      })),
      page: {
        number: 0,
        size: 100,
        totalItems: branchesHasNext ? 101 : branches,
        totalPages: branchesHasNext ? 2 : 1,
        hasNext: branchesHasNext,
        hasPrevious: false,
      },
    });
  }
}

async function show(userId = ROSE) {
  return renderWithProviders(await UserApprovalPage({ params: Promise.resolve({ userId }) }));
}

const card = (name: string) => screen.getByRole('region', { name });
/** The value cell of a description-list row in one card, found by its label. */
function fact(region: HTMLElement, label: string): HTMLElement {
  const value = within(region).getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`"${label}" has no value cell`);
  return value;
}
const button = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
});

describe('UserApprovalPage: the request', () => {
  it('shows who asked and when, in the organisation’s zone, under the page’s one h1', async () => {
    setup();
    await show(ROSE.toUpperCase());

    expect(getUser).toHaveBeenCalledExactlyOnceWith(ROSE);
    // Someone else's invitation: no switch to read.
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Rose Atieno' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    const request = card('Request');
    expect(fact(request, 'Invited by')).toHaveTextContent('Victor Kamau');
    // The membership's own creation: a re-invite keeps it, so it is the first invitation.
    expect(fact(request, 'First invited (Asia/Kolkata)')).toHaveTextContent('24 Sep 2026 · 13:30');
    expect(within(request).getByRole('link', { name: 'Open the audit trail' })).toHaveAttribute(
      'href',
      `/admin/users/${ROSE}/audit`,
    );
  });

  it('names each section once, and makes both assignment tables keyboard-scrollable regions', async () => {
    setup();
    await show();

    // getByRole throws on a second match, so each name is also checked unique (rule 11).
    expect(screen.getAllByRole('region')).toHaveLength(6);
    for (const name of ['Request', 'Identity', 'Requested access', 'Control checks']) {
      expect(card(name)).toBeInTheDocument();
    }
    for (const name of ['Role assignments', 'Branch assignments table']) {
      expect(screen.getByRole('region', { name })).toHaveAttribute('tabindex', '0');
    }
  });

  it('says so in Requested access when the role list is capped', async () => {
    setup({ roles: 100, rolesHasNext: true });
    await show();

    expect(within(card('Requested access')).getByText(ROLES_CAPPED)).toBeInTheDocument();
  });

  it('offers Approve and Reject & revoke while it waits, with every check computed', async () => {
    setup();
    await show();

    expect(button('Approve')).toBeEnabled();
    expect(button('Reject & revoke')).toBeEnabled();
    const checks = card('Control checks');
    expect(fact(checks, 'Invited by someone else')).toHaveTextContent('Passed');
    expect(fact(checks, 'Invited by someone else')).toHaveTextContent('Invited by Victor Kamau.');
    expect(fact(checks, 'Has an active role')).toHaveTextContent('Passed');
    expect(fact(checks, 'Has an active branch assignment')).toHaveTextContent('Passed');
    expect(fact(checks, 'Institution is active')).toHaveTextContent(
      'Greenfield Teachers SACCO is active.',
    );
  });

  // Each case holds every OTHER code, so a gate that checks only one of the two still fails one.
  it.each(['user.approve', 'user.view'])(
    'reads nothing past the profile without %s, and says why',
    async (missing) => {
      setup({ permissions: ALL_CODES.filter((code) => code !== missing) });
      await show();

      expect(screen.getByRole('heading', { level: 1, name: 'User approval' })).toBeInTheDocument();
      expect(screen.getByText(USER_APPROVAL_FORBIDDEN)).toBeInTheDocument();
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' }), "You don't have permission"],
    ['a 5xx', new BackendApiError(503, { requestId: 'req-6' }), 'Reference: req-6'],
  ])('tells %s on the user read apart, under the page h1', async (_case, error, text) => {
    setup();
    getUser.mockRejectedValue(error);
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User approval' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(button('Approve')).toBeNull();
  });

  it('answers a user the backend can’t find with not-found', async () => {
    setup();
    getUser.mockRejectedValue(new BackendApiError(404, { code: 'resource_not_found' }));
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

const without = (...codes: string[]) => ALL_CODES.filter((code) => !codes.includes(code));

describe('UserApprovalPage: maker-checker (BG-08, decision Q4)', () => {
  it('disables Approve for its inviter while maker-checker is on, matched case-insensitively', async () => {
    setup({ maker: { id: ME.toUpperCase(), displayName: 'Ann Admin' } });
    await show();

    expect(readMakerCheckerSwitch).toHaveBeenCalledExactlyOnceWith(
      'user_invites',
      expect.objectContaining({ tenantPermissions: expect.arrayContaining(['user.approve']) }),
    );
    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(button('Reject & revoke')).toBeEnabled();
    expect(fact(card('Request'), 'Invited by')).toHaveTextContent('You (Ann Admin)');
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent('Not met');
    expect(screen.queryByText(SELF_APPROVAL_NOTE_USERS)).toBeNull();
  });

  it('lets its inviter approve while maker-checker is off, saying so first', async () => {
    setup({ maker: { id: ME, displayName: 'Ann Admin' }, switchState: 'off' });
    await show();

    expect(button('Approve')).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(SELF_APPROVAL_NOTE_USERS);
    expect(button('Approve')).toHaveAccessibleDescription(SELF_APPROVAL_NOTE_USERS);
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent(
      'Not required',
    );
  });

  it('leaves Approve enabled for its inviter when the switch can’t be read, for the platform to decide', async () => {
    setup({ maker: { id: ME, displayName: 'Ann Admin' }, switchState: 'unknown' });
    await show();

    expect(button('Approve')).toBeEnabled();
    expect(screen.queryByText(SELF_APPROVAL_NOTE_USERS)).toBeNull();
    const check = fact(card('Control checks'), 'Invited by someone else');
    expect(check).toHaveTextContent('Checked on approval');
    expect(check).toHaveTextContent(VERIFIED_ON_APPROVAL);
  });

  it('names a blocked account before the switch, with no self-approval warning', async () => {
    setup({
      userStatus: 'SUSPENDED',
      maker: { id: ME, displayName: 'Ann Admin' },
      switchState: 'off',
    });
    await show();

    expect(button('Approve')).toHaveAccessibleDescription(accountBlockedNote('SUSPENDED'));
    expect(screen.queryByText(SELF_APPROVAL_NOTE_USERS)).toBeNull();
  });

  it('names the inviter from the record without audit.view', async () => {
    setup({ permissions: without('audit.view') });
    await show();

    expect(fact(card('Request'), 'Invited by')).toHaveTextContent('Victor Kamau');
    expect(screen.queryByRole('link', { name: 'Open the audit trail' })).toBeNull();
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent('Passed');
  });

  it('shows a dash when the record names no inviter (the system, or hidden)', async () => {
    setup({ maker: null });
    await show();

    expect(fact(card('Request'), 'Invited by')).toHaveTextContent('—');
    expect(readMakerCheckerSwitch).not.toHaveBeenCalled();
    expect(button('Approve')).toBeEnabled();
  });
});

describe('UserApprovalPage: where the request stands (Rulings 7, 12)', () => {
  it('offers no decision while their identity is provisioning, and says why', async () => {
    setup({ userStatus: 'PROVISIONING_IDP' });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Reject & revoke')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(PROVISIONING_NOTE);
    const recordLink = screen.getByRole('link', { name: 'Open their user record' });
    expect(recordLink).toHaveAttribute('href', `/admin/users/${ROSE}`);
    // Underlined, so the link is told apart from the note's text by more than colour (1.4.1).
    expect(recordLink).toHaveClass('MuiLink-underlineAlways');
    expect(screen.queryByRole('region', { name: 'Control checks' })).toBeNull();
  });

  it('offers no decision once decided', async () => {
    setup({ membershipStatus: 'ACTIVE', userStatus: 'ACTIVE' });
    await show();

    expect(button('Approve')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('Approved: this membership is active.');
  });

  it('disables Approve for a blocked account, keeping Reject & revoke', async () => {
    setup({ userStatus: 'SUSPENDED' });
    await show();

    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(accountBlockedNote('SUSPENDED'));
    expect(button('Reject & revoke')).toBeEnabled();
  });

  it('offers no decision without membership.view, and says so', async () => {
    setup({ permissions: without('membership.view') });
    await show();

    expect(getMembership).not.toHaveBeenCalled();
    expect(button('Approve')).toBeNull();
    expect(screen.getByText(NO_MEMBERSHIP_VIEW)).toBeInTheDocument();
    // The type comes with the user read (BG-09), so the branch check still runs.
    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Passed',
    );
  });
});

describe('UserApprovalPage: a branch-scoped membership.view (BG-33)', () => {
  // The platform checks the membership read tenant-wide, so a branch grant would be a 403.
  it('reads no membership and says the role can’t view it, at the selected branch', async () => {
    setup({
      branchOnly: ['membership.view'],
      selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' },
    });
    await show();

    expect(getMembership).not.toHaveBeenCalled();
    expect(fact(card('Requested access'), 'Primary branch')).toHaveTextContent(
      MEMBERSHIP_NOT_PERMITTED,
    );
    expect(screen.queryByText(READ_FAILED)).toBeNull();
    // The decisions need it tenant-wide too, so none is offered.
    expect(button('Approve')).toBeNull();
    expect(button('Reject & revoke')).toBeNull();
  });
});

describe('UserApprovalPage: the control checks read the page’s reads (Ruling 7)', () => {
  it('fails the role check when they hold none', async () => {
    setup({ roles: 0 });
    await show();

    expect(fact(card('Control checks'), 'Has an active role')).toHaveTextContent('Not met');
  });

  it('leaves the role check to the platform when the read failed, with Approve on offer', async () => {
    setup({ roles: new BackendApiError(503, { requestId: 'req-5' }) });
    await show();

    const check = fact(card('Control checks'), 'Has an active role');
    expect(check).toHaveTextContent('Checked on approval');
    expect(check).toHaveTextContent('Reference: req-5');
    expect(button('Approve')).toBeEnabled();
  });

  it('fails the branch check for a staff member only when every branch was seen and none held', async () => {
    setup({ branches: 0 });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not met',
    );
  });

  it('never proves "none" from a branch-scoped view (BG-03, rule 9)', async () => {
    setup({ branches: 0, branchOnly: ['branch_assignment.view'] });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Checked on approval',
    );
  });

  // BG-09: the type comes with the user read, so the check needs no membership read.
  it('marks the branch check not required for an auditor', async () => {
    setup({ branches: 0, membershipType: 'AUDITOR', permissions: without('membership.view') });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not required',
    );
    expect(fact(card('Requested access'), 'Membership type')).toHaveTextContent('Auditor');
  });

  it('says the branches are capped when one page doesn’t hold them all', async () => {
    setup({ branches: 1, branchesHasNext: true });
    await show();

    expect(within(card('Requested access')).getByText(BRANCHES_CAPPED)).toBeInTheDocument();
    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Passed',
    );
  });
});

// Beyond the plan's Task 7b list: each pins a page-owned wiring that a surviving mutant showed
// unpinned (a failed scan shown as a pass; a lost session swallowed; a failed lookup shown as a miss).
describe('UserApprovalPage: a failed read is never a pass, "none" or a miss (rule 9)', () => {
  it('leaves the branch check to the platform when the read failed, with Approve on offer', async () => {
    setup({ branches: new BackendApiError(503, { requestId: 'req-7' }) });
    await show();

    const check = fact(card('Control checks'), 'Has an active branch assignment');
    expect(check).toHaveTextContent('Checked on approval');
    expect(check).toHaveTextContent('Reference: req-7');
    expect(button('Approve')).toBeEnabled();
  });

  it.each([
    ['membership', { membership: new BackendApiError(401) }],
    ['role', { roles: new BackendApiError(401) }],
    ['branch', { branches: new BackendApiError(401) }],
  ])(
    'redirects, rendering nothing, when the %s read finds a lost session',
    async (_read, overrides) => {
      setup(overrides);
      await expect(show()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
      expect(redirect).toHaveBeenCalledTimes(1);
    },
  );

  // BG-09: the decisions act on the id the user read carries, so a failed membership read costs
  // only the primary branch.
  it('says a failed membership read failed, keeping the decisions on offer', async () => {
    setup({ membership: new BackendApiError(503, { requestId: 'req-8' }) });
    await show();

    const primary = fact(card('Requested access'), 'Primary branch');
    expect(primary).toHaveTextContent(READ_FAILED);
    expect(primary).toHaveTextContent('Reference: req-8');
    expect(button('Approve')).toBeEnabled();
    expect(button('Reject & revoke')).toBeEnabled();
    expect(getMembership).toHaveBeenCalledWith(MEMBERSHIP);
  });
});
