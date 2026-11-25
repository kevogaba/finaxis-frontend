import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ARCHIVED_ROLE_NOTE, HELD_ROLE } from '@/modules/administration/roles/role-rules';
import { renderWithProviders } from '@/test/test-utils';

const { countActiveRoleAssignments, getCurrentContextProfile, getRole, holdsRole } = vi.hoisted(
  () => ({
    countActiveRoleAssignments: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    getRole: vi.fn(),
    holdsRole: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/admin/roles/09000000-0000-4000-8000-000000000009',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  countActiveRoleAssignments: (...args: unknown[]) =>
    countActiveRoleAssignments(...args) as unknown,
  getRole: (...args: unknown[]) => getRole(...args) as unknown,
  holdsRole: (...args: unknown[]) => holdsRole(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-actions', () => ({
  activateRole: vi.fn(),
  archiveRole: vi.fn(),
  deactivateRole: vi.fn(),
}));

const { default: RoleRecordLayout } = await import('./layout');

const ROLE = '09000000-0000-4000-8000-000000000009';
const ME = '09000000-0000-4000-8000-0000000000aa';
const ORG = '11111111-1111-4111-8111-111111111111';
// An IAM_ADMIN-shaped holder: every role code, no user.assign_self.
const CODES = [
  'role.view',
  'role.activate',
  'role.deactivate',
  'role_assignment.view',
  'user.view',
];

interface Setup {
  status?: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  permissions?: string[];
  /** Codes held only at branch scope. */
  branchOnly?: string[];
  /** The ACTIVE roles `/auth/me` lists. */
  profileRoles?: string[];
  /** What the role-assignment read answers. */
  held?: boolean;
}

function setup({
  status = 'DISABLED',
  permissions = CODES,
  branchOnly = [],
  profileRoles = [],
  held = false,
}: Setup = {}) {
  getRole.mockResolvedValue({
    id: ROLE,
    roleCode: 'LOANS_OFFICER',
    roleName: 'Loans officer',
    systemRole: false,
    status,
  });
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: {
      user_id: ME,
      permissions,
      permission_scopes: permissions.map((code) => ({
        code,
        scope: branchOnly.includes(code) ? 'BRANCH' : 'TENANT',
      })),
      roles: profileRoles.map((id) => ({ id })),
    },
    context: { organization: { id: ORG, name: 'Greenfield' }, branch: null },
  });
  holdsRole.mockResolvedValue(held);
}

async function show() {
  const element = await RoleRecordLayout({
    children: <p>Tab body</p>,
    params: Promise.resolve({ roleId: ROLE }),
  });
  return renderWithProviders(element);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RoleRecordLayout: a role you hold (#342)', () => {
  it('reads whether you hold a DISABLED role, and blocks Activate with the reason', async () => {
    setup({ held: true });

    await show();

    expect(holdsRole).toHaveBeenCalledWith(ROLE, ME);
    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription(HELD_ROLE);
  });

  it('offers Activate on a role you do not hold (the control)', async () => {
    setup({ held: false });

    await show();

    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(screen.queryByText(HELD_ROLE)).toBeNull();
  });

  it('offers Activate on a role you hold when you hold user.assign_self tenant-wide', async () => {
    setup({ held: true, permissions: [...CODES, 'user.assign_self'] });

    await show();

    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
  });

  it('takes an ACTIVE role you hold from /auth/me, without a read, and still offers Deactivate', async () => {
    setup({ status: 'ACTIVE', profileRoles: [ROLE] });

    await show();

    expect(holdsRole).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('falls back to /auth/me without role_assignment.view', async () => {
    setup({ permissions: CODES.filter((code) => code !== 'role_assignment.view'), held: true });

    await show();

    expect(holdsRole).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
  });
});

describe('RoleRecordLayout: archiving (ADR 0035)', () => {
  const ADMIN = [...CODES, 'role.update', 'role.archive'];

  it('offers Archive with the active assignment count, which disables its confirm', async () => {
    const user = userEvent.setup();
    setup({ status: 'ACTIVE', permissions: ADMIN });
    countActiveRoleAssignments.mockResolvedValue(2);

    await show();

    expect(countActiveRoleAssignments).toHaveBeenCalledWith(ROLE);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Archive Loans officer?' });
    expect(dialog).toHaveTextContent('LOANS_OFFICER stays reserved');
    expect(dialog).toHaveTextContent('This role still has 2 active assignments.');
    expect(within(dialog).getByRole('button', { name: 'Archive' })).toBeDisabled();
  });

  // A branch-scoped role_assignment.view reads only its branches' rows: a partial count.
  it('leaves the count to the platform without role_assignment.view tenant-wide', async () => {
    const user = userEvent.setup();
    setup({ status: 'ACTIVE', permissions: ADMIN, branchOnly: ['role_assignment.view'] });

    await show();

    expect(countActiveRoleAssignments).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Archive Loans officer?' });
    expect(within(dialog).getByRole('button', { name: 'Archive' })).toBeEnabled();
  });

  it('shows an archived role as final, with nothing to change', async () => {
    setup({ status: 'ARCHIVED', permissions: [...ADMIN, 'user.assign_self'] });

    await show();

    expect(screen.getByRole('note')).toHaveTextContent(ARCHIVED_ROLE_NOTE);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(countActiveRoleAssignments).not.toHaveBeenCalled();
  });
});
