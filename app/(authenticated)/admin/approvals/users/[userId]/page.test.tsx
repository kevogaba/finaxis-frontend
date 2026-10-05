import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import { USER_APPROVAL_FORBIDDEN } from '@/modules/administration/approvals/approval-copy';
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
