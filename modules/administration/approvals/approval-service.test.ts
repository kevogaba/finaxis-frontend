import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { REQUESTED_ACCESS_CEILING } from './approval-copy';
import { pendingCountSchema } from './approval-contract';

const { apiGet, listBranches, listRoleAssignments, listUserBranchAssignments, listUsers } =
  vi.hoisted(() => ({
    apiGet: vi.fn(),
    listBranches: vi.fn(),
    listRoleAssignments: vi.fn(),
    listUserBranchAssignments: vi.fn(),
    listUsers: vi.fn(),
  }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  listUserBranchAssignments: (...args: unknown[]) => listUserBranchAssignments(...args) as unknown,
  listUsers: (...args: unknown[]) => listUsers(...args) as unknown,
}));

const service = await import('./approval-service');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const USER = 'f6000000-0000-4000-8000-0000000000ab';

const total = (totalItems: number) => ({
  items: [],
  page: {
    number: 0,
    size: 1,
    totalItems,
    totalPages: totalItems,
    hasNext: false,
    hasPrevious: false,
  },
});

describe('approval service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists pending memberships newest first, with no sort (the endpoint has none)', async () => {
    listUsers.mockResolvedValue(total(0));
    await service.listUserApprovals({ page: 2, size: 20 });
    expect(listUsers).toHaveBeenCalledExactlyOnceWith({
      membershipStatus: 'PENDING_APPROVAL',
      page: 2,
      size: 20,
    });
  });

  it('lists pending branches in the sort the tab asked for', async () => {
    listBranches.mockResolvedValue(total(0));
    await service.listBranchActivations({
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 10,
    });
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'PENDING_APPROVAL',
      sort: { by: 'branchName', dir: 'ASC' },
      page: 0,
      size: 10,
    });
  });

  it('counts pending and provisioning memberships with two size=1 reads (spec §8)', async () => {
    listUsers.mockResolvedValueOnce(total(9)).mockResolvedValueOnce(total(1));
    await expect(service.countUserApprovals()).resolves.toEqual({ pending: 9, provisioning: 1 });
    expect(listUsers.mock.calls).toEqual([
      [{ membershipStatus: 'PENDING_APPROVAL', page: 0, size: 1 }],
      [{ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP', page: 0, size: 1 }],
    ]);
  });

  it('counts pending branches with one size=1 read', async () => {
    listBranches.mockResolvedValue(total(3));
    await expect(service.countBranchActivations()).resolves.toBe(3);
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'PENDING_APPROVAL',
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
  });

  // Rule 21a: never a quiet zero. The caller's load() redirects or says it failed.
  it.each([
    ['a 401', new BackendApiError(401)],
    ['a stale context', new BackendApiError(403, { code: 'invalid_active_tenant_context' })],
    ['a 5xx', new BackendApiError(503)],
  ])('rejects the counts with the read’s own error on %s', async (_case, error) => {
    listUsers.mockResolvedValueOnce(total(9)).mockRejectedValueOnce(error);
    await expect(service.countUserApprovals()).rejects.toBe(error);
    listBranches.mockRejectedValueOnce(error);
    await expect(service.countBranchActivations()).rejects.toBe(error);
  });

  it('rejects every other read with its own error too (layer 14 reuses the lists)', async () => {
    const error = new BackendApiError(403, { code: 'invalid_active_tenant_context' });
    listUsers.mockRejectedValueOnce(error).mockResolvedValueOnce(total(1));
    await expect(service.countUserApprovals()).rejects.toBe(error);
    listUsers.mockRejectedValueOnce(error);
    await expect(service.listUserApprovals({ page: 0, size: 10 })).rejects.toBe(error);
    listBranches.mockRejectedValueOnce(error);
    await expect(
      service.listBranchActivations({ sort: { by: 'createdAt', dir: 'DESC' }, page: 0, size: 10 }),
    ).rejects.toBe(error);
    listRoleAssignments.mockRejectedValueOnce(error);
    await expect(service.listRequestedRoles(USER)).rejects.toBe(error);
  });

  // BG-22: one read of the platform's counts, through the approvals contract.
  it('reads the pending counts from the count route', async () => {
    apiGet.mockResolvedValue({ branches: 2 });
    await expect(service.readPendingCounts()).resolves.toEqual({ branches: 2 });
    expect(apiGet).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/tenant/approvals/pending-count',
      pendingCountSchema,
    );
  });

  it('rejects the pending counts with the read’s own error', async () => {
    const error = new BackendApiError(403, { code: 'forbidden' });
    apiGet.mockRejectedValue(error);
    await expect(service.readPendingCounts()).rejects.toBe(error);
  });

  it('reads one bounded page of the user’s ACTIVE role assignments', async () => {
    listRoleAssignments.mockResolvedValue(total(0));
    await service.listRequestedRoles(USER);
    expect(listRoleAssignments).toHaveBeenCalledExactlyOnceWith(
      { userId: USER, status: 'ACTIVE' },
      { page: 0, size: REQUESTED_ACCESS_CEILING },
    );
    expect(REQUESTED_ACCESS_CEILING).toBe(100);
  });

  // BG-09: one platform page by user, like the roles; no scan.
  it('reads one bounded page of the user’s ACTIVE branch assignments', async () => {
    listUserBranchAssignments.mockResolvedValue(total(0));
    await service.listRequestedBranches(USER);
    expect(listUserBranchAssignments).toHaveBeenCalledExactlyOnceWith(USER, {
      page: 0,
      size: REQUESTED_ACCESS_CEILING,
    });
  });
});
