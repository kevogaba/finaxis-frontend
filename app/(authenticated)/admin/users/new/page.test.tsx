import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { screen } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { InviteUserWizard } from '@/modules/administration/users/components/invite-user-wizard';
import { INVITE_CODES, INVITE_FORBIDDEN } from '@/modules/administration/users/invite-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile, listBranches, listRoles, redirect, wizards } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  listBranches: vi.fn(),
  listRoles: vi.fn(),
  redirect: vi.fn(),
  // The props the page handed the wizard, one entry per render.
  wizards: [] as ComponentProps<typeof InviteUserWizard>[],
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  // The real `unstable_rethrow` for load().
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (to: string) => redirect(to) as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoles: (...args: unknown[]) => listRoles(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/users/components/invite-user-wizard', () => ({
  InviteUserWizard: (props: ComponentProps<typeof InviteUserWizard>) => {
    wizards.push(props);
    return <p>The wizard</p>;
  },
}));

const { default: InviteUserPage } = await import('./page');

const ORG = '11111111-1111-4111-8111-111111111111';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const NO_ACTIVE_ROLES =
  'There are no active roles to assign. Create or activate one under Roles & permissions.';
const NO_ACTIVE_BRANCHES =
  'There are no active branches to assign. Activate one under Branches first.';

const resolved = (permissions: readonly string[] = INVITE_CODES) => ({
  kind: 'resolved',
  profile: { permissions },
  context: { organization: { id: ORG, name: 'Greenfield SACCO' }, branch: null },
});

const page = <T,>(items: T[], hasNext = false) => ({
  items,
  page: {
    number: 0,
    size: 100,
    totalItems: items.length,
    totalPages: 1,
    hasNext,
    hasPrevious: false,
  },
});

const ROLE = {
  id: TELLER,
  roleCode: 'TELLER',
  roleName: 'Teller',
  systemRole: false,
  status: 'ACTIVE',
};
const BRANCH = {
  id: WESTLANDS,
  branchCode: 'WESTLANDS',
  branchName: 'Westlands Branch',
  branchType: 'OPERATIONS',
  status: 'ACTIVE',
  createdAt: '2026-07-01T08:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  wizards.length = 0;
  redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  getCurrentContextProfile.mockResolvedValue(resolved());
  listRoles.mockResolvedValue(page([ROLE]));
  listBranches.mockResolvedValue(page([BRANCH]));
});

describe('InviteUserPage', () => {
  it('reads one page of 100 active roles and branches by name and hands them to the wizard', async () => {
    renderWithProviders(await InviteUserPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Invite user' })).toBeInTheDocument();
    expect(listRoles).toHaveBeenCalledWith({
      status: 'ACTIVE',
      sort: { by: 'roleName', dir: 'ASC' },
      page: 0,
      size: 100,
    });
    expect(listBranches).toHaveBeenCalledWith({
      status: 'ACTIVE',
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 100,
    });
    expect(wizards).toEqual([
      {
        roles: [{ id: TELLER, label: 'Teller (TELLER)' }],
        branches: [{ id: WESTLANDS, label: 'Westlands Branch (WESTLANDS)' }],
        rolesCapped: false,
        branchesCapped: false,
        contextOrganisationId: ORG,
      },
    ]);
  });

  it('tells the wizard when either list stops at 100', async () => {
    listRoles.mockResolvedValue(page([ROLE], true));
    listBranches.mockResolvedValue(page([BRANCH], true));
    renderWithProviders(await InviteUserPage());
    expect(wizards[0]).toMatchObject({ rolesCapped: true, branchesCapped: true });
  });

  it.each(INVITE_CODES)('says why, and reads nothing, without %s (Ruling 4)', async (missing) => {
    getCurrentContextProfile.mockResolvedValue(
      resolved(INVITE_CODES.filter((code) => code !== missing)),
    );
    renderWithProviders(await InviteUserPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Invite user' })).toBeInTheDocument();
    expect(screen.getByText(INVITE_FORBIDDEN)).toBeInTheDocument();
    expect(listRoles).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    expect(wizards).toHaveLength(0);
  });

  it('says so for an unresolved context too', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(INVITE_FORBIDDEN)).toBeInTheDocument();
  });

  it('shows the forbidden state for a refused read and the error, with its reference, for another', async () => {
    listRoles.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText("You don't have permission")).toBeInTheDocument();
    expect(wizards).toHaveLength(0);

    listBranches.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-9' }));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(/Reference: req-9/)).toBeInTheDocument();
    expect(wizards).toHaveLength(0);
  });

  it.each([
    [new BackendApiError(401), '/login?reason=session_expired'],
    [new BackendApiError(403, { code: 'invalid_active_tenant_context' }), '/select-context'],
  ])('redirects a lost session or a stale context (%s)', async (error, to) => {
    listBranches.mockRejectedValueOnce(error);
    await expect(InviteUserPage()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it('points to Roles when no role is active, instead of a wizard that cannot finish', async () => {
    listRoles.mockResolvedValue(page([]));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(NO_ACTIVE_ROLES)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Roles & permissions' })).toHaveAttribute(
      'href',
      '/admin/roles',
    );
    expect(wizards).toHaveLength(0);
  });

  it('points to Branches when no branch is active', async () => {
    listBranches.mockResolvedValue(page([]));
    renderWithProviders(await InviteUserPage());
    expect(screen.getByText(NO_ACTIVE_BRANCHES)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(wizards).toHaveLength(0);
  });
});
