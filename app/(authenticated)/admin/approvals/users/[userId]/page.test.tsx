import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { VERIFIED_ON_APPROVAL } from '@/modules/administration/approvals/approval-checks';
import {
  MAKER_NOT_PERMITTED,
  READ_FAILED,
  USER_APPROVAL_FORBIDDEN,
} from '@/modules/administration/approvals/approval-copy';
import {
  accountBlockedNote,
  MEMBERSHIP_MISSING,
  MEMBERSHIP_UNAVAILABLE,
  NO_MEMBERSHIP_VIEW,
  PROVISIONING_NOTE,
  USER_MAKER_CHECKER_BLOCKED,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';

const {
  findUserMembership,
  getCurrentContextProfile,
  getMakerEvent,
  getTenantUser,
  getUser,
  listRequestedRoles,
  listUserBranchAssignments,
  redirect,
} = vi.hoisted(() => ({
  findUserMembership: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getMakerEvent: vi.fn(),
  getTenantUser: vi.fn(),
  getUser: vi.fn(),
  listRequestedRoles: vi.fn(),
  listUserBranchAssignments: vi.fn(),
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
  getTenantUser: (...args: unknown[]) => getTenantUser(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  getMakerEvent: (...args: unknown[]) => getMakerEvent(...args) as unknown,
  listRequestedRoles: (...args: unknown[]) => listRequestedRoles(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  findUserMembership: (...args: unknown[]) => findUserMembership(...args) as unknown,
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
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
  /** The membership lookup: found, null (missed), or an Error that rejects it. */
  membership?: Record<string, unknown> | null | Error;
  /** The maker read: its actor, null (no event), or an Error that rejects it. */
  maker?: string | null | Error;
  roles?: number | Error;
  rolesHasNext?: boolean;
  branches?: number | Error;
  truncated?: boolean;
  selectedBranch?: { id: string; name: string } | null;
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
  maker = VICTOR,
  roles = 1,
  rolesHasNext = false,
  branches = 1,
  truncated = false,
  selectedBranch = null,
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { user_id: ME, permissions, branches: [] },
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
  });
  if (membership instanceof Error) findUserMembership.mockRejectedValue(membership);
  else findUserMembership.mockResolvedValue(membership);
  if (maker instanceof Error) getMakerEvent.mockRejectedValue(maker);
  else {
    getMakerEvent.mockResolvedValue(
      maker === null ? null : { actorUserId: maker, occurredAt: '2026-09-24T08:00:00Z' },
    );
  }
  getTenantUser.mockImplementation((id: string) =>
    Promise.resolve(
      id.toLowerCase() === ME
        ? { id: ME, displayName: 'Ann Admin', email: 'ann@x.example' }
        : { id: VICTOR, displayName: 'Victor Kamau', email: 'victor@x.example' },
    ),
  );
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
  if (branches instanceof Error) listUserBranchAssignments.mockRejectedValue(branches);
  else {
    listUserBranchAssignments.mockResolvedValue({
      items: Array.from({ length: branches }, (_, n) => ({
        id: `8${n}000000-0000-4000-8000-000000000000`,
        branchId: WESTLANDS,
        assignmentType: 'HOME',
      })),
      truncated,
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
    expect(getMakerEvent).toHaveBeenCalledExactlyOnceWith('user', ROSE);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Rose Atieno' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to user onboarding' })).toHaveAttribute(
      'href',
      '/admin/approvals/users',
    );
    const request = card('Request');
    expect(fact(request, 'Invited by')).toHaveTextContent('Victor Kamau');
    expect(fact(request, 'Invited (Asia/Kolkata)')).toHaveTextContent('24 Sep 2026 · 13:30');
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

  it('reads nothing past the profile without both codes, and says why', async () => {
    setup({ permissions: ['user.approve'] });
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'User approval' })).toBeInTheDocument();
    expect(screen.getByText(USER_APPROVAL_FORBIDDEN)).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();
  });

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

describe('UserApprovalPage: maker-checker (Ruling 5)', () => {
  it('disables Approve for its inviter, matched case-insensitively, and marks them as you', async () => {
    setup({ maker: ME.toUpperCase() });
    await show();

    expect(button('Approve')).toBeDisabled();
    expect(button('Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    expect(button('Reject & revoke')).toBeEnabled();
    expect(fact(card('Request'), 'Invited by')).toHaveTextContent('Ann Admin (you)');
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent('Not met');
  });

  it.each([
    ['a 401', new BackendApiError(401), '/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      '/select-context',
    ],
  ])('redirects, rendering nothing, when the maker read finds %s', async (_case, error, to) => {
    setup({ maker: error });
    await expect(show()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden', requestId: 'req-4' })],
    ['a 5xx', new BackendApiError(500, { requestId: 'req-4' })],
  ])(
    'leaves Approve on offer, verified by the platform, when the maker read fails with %s',
    async (_case, error) => {
      setup({ maker: error });
      await show();

      expect(button('Approve')).toBeEnabled();
      expect(fact(card('Request'), 'Invited by')).toHaveTextContent(READ_FAILED);
      expect(fact(card('Request'), 'Invited by')).toHaveTextContent('Reference: req-4');
      const check = fact(card('Control checks'), 'Invited by someone else');
      expect(check).toHaveTextContent('Checked on approval');
      expect(check).toHaveTextContent(VERIFIED_ON_APPROVAL);
      expect(check).toHaveTextContent('Reference: req-4');
    },
  );

  it('reads no maker without audit.view, and says the platform verifies it', async () => {
    setup({ permissions: without('audit.view') });
    await show();

    expect(getMakerEvent).not.toHaveBeenCalled();
    expect(button('Approve')).toBeEnabled();
    expect(fact(card('Request'), 'Invited by')).toHaveTextContent(MAKER_NOT_PERMITTED);
    expect(screen.queryByRole('link', { name: 'Open the audit trail' })).toBeNull();
    expect(fact(card('Control checks'), 'Invited by someone else')).toHaveTextContent(
      VERIFIED_ON_APPROVAL,
    );
  });
});

describe('UserApprovalPage: where the request stands (Rulings 7, 12)', () => {
  it('offers no decision while their identity is provisioning, and says why', async () => {
    setup({ userStatus: 'PROVISIONING_IDP' });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Reject & revoke')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(PROVISIONING_NOTE);
    expect(screen.getByRole('link', { name: 'Open their user record' })).toHaveAttribute(
      'href',
      `/admin/users/${ROSE}`,
    );
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

    expect(findUserMembership).not.toHaveBeenCalled();
    expect(button('Approve')).toBeNull();
    expect(screen.getByText(NO_MEMBERSHIP_VIEW)).toBeInTheDocument();
    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Checked on approval',
    );
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

  it('fails the branch check for a staff member only when a complete scan found none', async () => {
    setup({ branches: 0 });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not met',
    );
  });

  it.each([
    ['a capped scan', { truncated: true }],
    ['a selected branch', { selectedBranch: { id: WESTLANDS, name: 'Westlands Branch' } }],
  ])('never proves "none" from %s (rule 9)', async (_case, overrides) => {
    setup({ branches: 0, ...overrides });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Checked on approval',
    );
  });

  it('marks the branch check not required for an auditor', async () => {
    setup({
      branches: 0,
      membership: {
        id: MEMBERSHIP,
        userId: ROSE,
        status: 'PENDING_APPROVAL',
        type: 'AUDITOR',
        primaryBranchId: null,
      },
    });
    await show();

    expect(fact(card('Control checks'), 'Has an active branch assignment')).toHaveTextContent(
      'Not required',
    );
  });
});

// Beyond the plan's Task 7b list: each pins a page-owned wiring that a surviving mutant showed
// unpinned (a failed scan shown as a pass; a lost session swallowed; a failed lookup shown as a miss).
describe('UserApprovalPage: a failed read is never a pass, "none" or a miss (rule 9)', () => {
  it('leaves the branch check to the platform when the scan failed, with Approve on offer', async () => {
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
    ['branch scan', { branches: new BackendApiError(401) }],
  ])(
    'redirects, rendering nothing, when the %s read finds a lost session',
    async (_read, overrides) => {
      setup(overrides);
      await expect(show()).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
      expect(redirect).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['missed', null, MEMBERSHIP_MISSING],
    ['failed', new BackendApiError(503, { requestId: 'req-8' }), MEMBERSHIP_UNAVAILABLE],
  ])('says the membership lookup %s, and offers no decision', async (_case, membership, note) => {
    setup({ membership });
    await show();

    expect(button('Approve')).toBeNull();
    expect(button('Reject & revoke')).toBeNull();
    expect(screen.getByText(note)).toBeInTheDocument();
  });
});
