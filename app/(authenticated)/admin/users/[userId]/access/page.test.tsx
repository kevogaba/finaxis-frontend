import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  ACCESS_DESCRIPTION,
  NO_ACTIVE_ROLES,
  ROLES_UNAVAILABLE,
} from '@/modules/administration/users/user-rules';
import { renderWithProviders } from '@/test/test-utils';

const {
  getBranchIndex,
  getCurrentContextProfile,
  getRoleIndex,
  getUser,
  listRoleAssignments,
  listUserBranchAssignments,
} = vi.hoisted(() => ({
  getBranchIndex: vi.fn(),
  getCurrentContextProfile: vi.fn(),
  getRoleIndex: vi.fn(),
  getUser: vi.fn(),
  listRoleAssignments: vi.fn(),
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
  getBranchIndex: () => getBranchIndex() as unknown,
  getRoleIndex: () => getRoleIndex() as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => getUser(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
}));

const { default: UserAccessPage } = await import('./page');

const FELIX = '10000000-0000-4000-8000-00000000000d';
const ORG = '11111111-1111-4111-8111-111111111111';
const TELLER = '66666666-6666-4666-8666-666666666666';
const ALL_CODES = [
  'user.view',
  'user.assign_role',
  'user.revoke_role',
  'role_assignment.view',
  'role.view',
  'branch_assignment.view',
];

type RoleIndex = [string, { name: string; code: string; status: string; systemRole: boolean }][];
const TELLER_ROLE: RoleIndex = [
  [TELLER, { name: 'Teller', code: 'TELLER', status: 'ACTIVE', systemRole: false }],
];
const DISABLED_TELLER: RoleIndex = [
  [TELLER, { name: 'Teller', code: 'TELLER', status: 'DISABLED', systemRole: false }],
];

interface Setup {
  permissions?: string[];
  /** The role index the page reads: empty on any failure (lib/api/lookups.ts). */
  index?: RoleIndex;
  membershipStatus?: string;
}

/** Programs every service the page reads. A test names only what it varies. */
function setup({
  permissions = ALL_CODES,
  index = TELLER_ROLE,
  membershipStatus = 'ACTIVE',
}: Setup = {}) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { permissions, user_id: 'someone-else', branches: [] },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  getUser.mockResolvedValue({ id: FELIX, displayName: 'Felix Omondi', membershipStatus });
  listRoleAssignments.mockResolvedValue({
    items: [],
    page: { number: 0, size: 10, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false },
  });
  listUserBranchAssignments.mockResolvedValue({ items: [], truncated: false });
  getRoleIndex.mockResolvedValue(new Map(index));
  getBranchIndex.mockResolvedValue(new Map());
}

async function show() {
  const element = await UserAccessPage({
    params: Promise.resolve({ userId: FELIX }),
    searchParams: Promise.resolve({}),
  });
  if (!element) throw new Error('The page rendered nothing');
  return renderWithProviders(element);
}

const assignButton = () => screen.queryByRole('button', { name: 'Assign role' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UserAccessPage: when no role can be offered (1b)', () => {
  it('says the roles could not be loaded, not that there are none, when the role index is empty', async () => {
    // Every tenant has system roles, so an empty index is a failed read (getRoleIndex swallows it).
    setup({ index: [] });

    await show();

    expect(screen.getByText(ROLES_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
    expect(screen.queryByText(ACCESS_DESCRIPTION)).toBeNull();
    expect(assignButton()).toBeNull();
  });

  it('says there are no active roles when the index is not empty but none of its roles is ACTIVE', async () => {
    setup({ index: DISABLED_TELLER });

    await show();

    expect(screen.getByText(NO_ACTIVE_ROLES)).toBeInTheDocument();
    expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
    expect(assignButton()).toBeNull();
  });

  it('describes the tab and offers the assignment when an ACTIVE role exists (the control for the cases above)', async () => {
    setup();

    await show();

    expect(screen.getByText(ACCESS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
    expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
    expect(assignButton()).toBeInTheDocument();
  });

  it.each([
    ['a REVOKED membership', { membershipStatus: 'REVOKED' }],
    [
      'no user.assign_role',
      { permissions: ALL_CODES.filter((code) => code !== 'user.assign_role') },
    ],
    ['no role.view', { permissions: ALL_CODES.filter((code) => code !== 'role.view') }],
  ] as [string, Setup][])(
    'says nothing about roles being unavailable when nothing could be assigned anyway: %s',
    async (_label, overrides) => {
      setup({ ...overrides, index: [] });

      await show();

      expect(screen.getByText(ACCESS_DESCRIPTION)).toBeInTheDocument();
      expect(screen.queryByText(ROLES_UNAVAILABLE)).toBeNull();
      expect(screen.queryByText(NO_ACTIVE_ROLES)).toBeNull();
      expect(assignButton()).toBeNull();
    },
  );
});
