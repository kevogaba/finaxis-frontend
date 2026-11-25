import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { HELD_ROLE } from '@/modules/administration/roles/role-rules';
import { renderWithProviders } from '@/test/test-utils';

const {
  getCurrentContextProfile,
  getPermissionCatalogue,
  getRole,
  holdsRole,
  listGrantedCodes,
  listRolePermissions,
} = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getPermissionCatalogue: vi.fn(),
  getRole: vi.fn(),
  holdsRole: vi.fn(),
  listGrantedCodes: vi.fn(),
  listRolePermissions: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/admin/roles/permissions',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getOrganisationTimeZone: () => Promise.resolve('Africa/Nairobi'),
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  getPermissionCatalogue: () => getPermissionCatalogue() as unknown,
  getRole: (...args: unknown[]) => getRole(...args) as unknown,
  holdsRole: (...args: unknown[]) => holdsRole(...args) as unknown,
  listGrantedCodes: (...args: unknown[]) => listGrantedCodes(...args) as unknown,
  listRolePermissions: (...args: unknown[]) => listRolePermissions(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  grantPermissions: vi.fn(),
  removePermission: vi.fn(),
}));

const { default: RolePermissionsPage } = await import('./page');

const ROLE = '09000000-0000-4000-8000-000000000007';
const ME = '09000000-0000-4000-8000-0000000000aa';
const ORG = '11111111-1111-4111-8111-111111111111';
// An IAM_ADMIN-shaped holder: the grant codes, no user.assign_self.
const CODES = [
  'role.view',
  'role.assign_permission',
  'permission.view',
  'role_assignment.view',
  'user.view',
];
const entry = (code: string, name: string) => ({
  id: code,
  code,
  name,
  module: 'iam',
  risk: 'HIGH',
  status: 'ACTIVE',
  kind: 'MUTATION',
  grantScope: 'TENANT',
  requiredViewPermissions: [],
});
const page = <T,>(items: T[]) => ({
  items,
  page: { number: 0, size: 100, totalItems: items.length, totalPages: 1, hasNext: false },
});

interface Setup {
  permissions?: string[];
  profileRoles?: string[];
  held?: boolean;
  status?: 'ACTIVE' | 'DISABLED';
}

function setup({
  permissions = CODES,
  profileRoles = [],
  held = false,
  status = 'ACTIVE',
}: Setup = {}) {
  getRole.mockResolvedValue({
    id: ROLE,
    roleCode: 'TELLER',
    roleName: 'Teller',
    systemRole: false,
    status,
  });
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      user_id: ME,
      permissions,
      permission_scopes: permissions.map((code) => ({ code, scope: 'TENANT' })),
      roles: profileRoles.map((id) => ({ id })),
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  holdsRole.mockResolvedValue(held);
  listRolePermissions.mockResolvedValue(page([]));
  getPermissionCatalogue.mockResolvedValue(
    page([entry('user.assign_self', 'Assign self'), entry('user.suspend', 'Suspend user')]),
  );
  listGrantedCodes.mockResolvedValue(new Set());
}

async function show() {
  const element = await RolePermissionsPage({
    params: Promise.resolve({ roleId: ROLE }),
    searchParams: Promise.resolve({}),
  });
  if (!element) throw new Error('The page rendered nothing');
  return renderWithProviders(element);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RolePermissionsPage: a role you hold (#342)', () => {
  it('shows Grant permissions disabled with the reason on a role /auth/me says you hold', async () => {
    setup({ profileRoles: [ROLE] });

    await show();

    const grant = screen.getByRole('button', { name: 'Grant permissions' });
    expect(grant).toBeDisabled();
    expect(grant).toHaveAccessibleDescription(HELD_ROLE);
    expect(holdsRole).not.toHaveBeenCalled();
  });

  it('reads whether you hold a DISABLED role, which /auth/me does not list', async () => {
    setup({ held: true, status: 'DISABLED' });

    await show();

    expect(holdsRole).toHaveBeenCalledWith(ROLE, ME);
    expect(screen.getByRole('button', { name: 'Grant permissions' })).toBeDisabled();
  });

  it('takes /auth/me as the answer for an ACTIVE role, with no extra read', async () => {
    setup({ held: true });

    await show();

    expect(holdsRole).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Grant permissions' })).toBeEnabled();
  });

  it('offers Grant permissions on a role you do not hold (the control)', async () => {
    setup();

    await show();

    expect(screen.getByRole('button', { name: 'Grant permissions' })).toBeEnabled();
    expect(screen.queryByText(HELD_ROLE)).toBeNull();
  });
});

describe('RolePermissionsPage: the grant drawer', () => {
  it('never offers user.assign_self, even to a tenant administrator (422)', async () => {
    const user = userEvent.setup();
    setup({ permissions: [...CODES, 'user.assign_self'], profileRoles: [ROLE] });
    await show();

    await user.click(screen.getByRole('button', { name: 'Grant permissions' }));

    expect(await screen.findByRole('checkbox', { name: /Suspend user/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Assign self/ })).toBeNull();
  });
});
