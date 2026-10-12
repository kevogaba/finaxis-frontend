import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';

// Every read either detail route can make, so "before any read" is checked against all of them: a
// read someone adds later and forgets to guard still has to be listed here.
const reads = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getUser: vi.fn(),
  findUserMembership: vi.fn(),
  listUserBranchAssignments: vi.fn(),
  getBranch: vi.fn(),
  getMakerEvent: vi.fn(),
  listRequestedRoles: vi.fn(),
  getBranchIndex: vi.fn(),
  getRoleIndex: vi.fn(),
  getOrganisationTimeZone: vi.fn(),
  getTenantUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) =>
    reads.getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  getUser: (...args: unknown[]) => reads.getUser(...args) as unknown,
  findUserMembership: (...args: unknown[]) => reads.findUserMembership(...args) as unknown,
  listUserBranchAssignments: (...args: unknown[]) =>
    reads.listUserBranchAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  getBranch: (...args: unknown[]) => reads.getBranch(...args) as unknown,
}));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  getMakerEvent: (...args: unknown[]) => reads.getMakerEvent(...args) as unknown,
  listRequestedRoles: (...args: unknown[]) => reads.listRequestedRoles(...args) as unknown,
}));
vi.mock('@/lib/api/lookups', () => ({
  getBranchIndex: (...args: unknown[]) => reads.getBranchIndex(...args) as unknown,
  getRoleIndex: (...args: unknown[]) => reads.getRoleIndex(...args) as unknown,
  getOrganisationTimeZone: (...args: unknown[]) =>
    reads.getOrganisationTimeZone(...args) as unknown,
  getTenantUser: (...args: unknown[]) => reads.getTenantUser(...args) as unknown,
}));
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

const { default: UserApprovalPage } = await import('./users/[userId]/page');
const { default: BranchApprovalPage } = await import('./branches/[branchId]/page');

// Lettered at its end, so its upper-case form differs from it.
const ID = 'a1000000-0000-4000-8000-00000000000d';

const routes: Record<
  string,
  { render: (id: string) => Promise<unknown>; read: keyof typeof reads }
> = {
  'the user approval page': {
    render: (userId) => UserApprovalPage({ params: Promise.resolve({ userId }) }),
    read: 'getUser',
  },
  'the branch approval page': {
    render: (branchId) => BranchApprovalPage({ params: Promise.resolve({ branchId }) }),
    read: 'getBranch',
  },
};

describe.each(Object.entries(routes))('%s', (_name, route) => {
  beforeEach(() => {
    vi.resetAllMocks();
    // A BackendApiError with a reference, so the pages settle it quietly (a plain Error would log).
    for (const read of Object.values(reads))
      read.mockRejectedValue(new BackendApiError(500, { requestId: 'req-unreachable' }));
    reads.getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: {
        user_id: 'b2000000-0000-4000-8000-0000000000bb',
        permissions: ['user.approve', 'user.view', 'branch.activate', 'branch.view'],
        branches: [],
      },
      context: { organization: { id: 'org-1', name: 'Greenfield' }, branch: null },
    });
  });

  it.each([
    'not-a-uuid',
    '../x',
    'new',
    '',
    `${ID}x`,
    `${ID}/../activate`,
    ` ${ID}`,
    `../${ID}`,
    ID.slice(0, -1),
    `g${ID.slice(1)}`,
  ])('answers %j with not-found, without reading anything (the profile included)', async (id) => {
    await expect(route.render(id)).rejects.toThrow('NEXT_NOT_FOUND');
    for (const [name, read] of Object.entries(reads)) {
      expect(read, name).not.toHaveBeenCalled();
    }
  });

  it('reads an upper-case id in its lower-case form, and in no other', async () => {
    // Positive control: a valid id does read. The backend is unreachable, so the route settles on
    // its failure branch; only what it asked for matters.
    await Promise.resolve(route.render(ID.toUpperCase())).catch(() => undefined);

    expect(reads[route.read]).toHaveBeenCalledWith(ID);
    for (const [name, read] of Object.entries(reads)) {
      for (const call of read.mock.calls) {
        expect(JSON.stringify(call), name).not.toContain(ID.toUpperCase());
      }
    }
  });
});
