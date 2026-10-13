import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { REQUESTED_ROLES_CEILING } from './approval-copy';

const { listAuditEvents, listBranches, listRoleAssignments, listUsers } = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
  listBranches: vi.fn(),
  listRoleAssignments: vi.fn(),
  listUsers: vi.fn(),
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));
vi.mock('@/modules/administration/roles/role-service', () => ({
  listRoleAssignments: (...args: unknown[]) => listRoleAssignments(...args) as unknown,
}));
vi.mock('@/modules/administration/users/user-service', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args) as unknown,
}));

const service = await import('./approval-service');

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const USER = 'f6000000-0000-4000-8000-0000000000ab';
const BRANCH = 'a7000000-0000-4000-8000-0000000000cd';
const VICTOR = 'b8000000-0000-4000-8000-0000000000ef';

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

  it.each([
    ['user', 'USER', 'user.invite'],
    ['branch', 'BRANCH', 'branch.create_draft'],
  ] as const)(
    'reads a %s request’s maker event by its lower-cased id (contract §G)',
    async (kind, entityType, action) => {
      listAuditEvents.mockResolvedValue({
        items: [{ actorUserId: VICTOR, occurredAt: '2026-09-20T08:00:00Z' }],
        page: total(1).page,
      });
      const id = kind === 'user' ? USER : BRANCH;
      await expect(service.getMakerEvent(kind, id.toUpperCase())).resolves.toEqual({
        actorUserId: VICTOR,
        occurredAt: '2026-09-20T08:00:00Z',
      });
      expect(listAuditEvents).toHaveBeenCalledExactlyOnceWith({
        entityType,
        action,
        entityId: id,
        page: 0,
        size: 1,
      });
    },
  );

  it('answers null when the log holds no maker event, and rejects a malformed id before any read', async () => {
    listAuditEvents.mockResolvedValue({ items: [], page: total(0).page });
    await expect(service.getMakerEvent('user', USER)).resolves.toBeNull();
    await expect(service.getMakerEvent('user', '../x')).rejects.toThrow();
    expect(listAuditEvents).toHaveBeenCalledTimes(1);
  });

  it('rejects the maker read with its own error (the page decides what it means)', async () => {
    const error = new BackendApiError(403, { code: 'forbidden' });
    listAuditEvents.mockRejectedValue(error);
    await expect(service.getMakerEvent('branch', BRANCH)).rejects.toBe(error);
  });

  it('reads one bounded page of the user’s ACTIVE role assignments', async () => {
    listRoleAssignments.mockResolvedValue(total(0));
    await service.listRequestedRoles(USER);
    expect(listRoleAssignments).toHaveBeenCalledExactlyOnceWith(
      { userId: USER, status: 'ACTIVE' },
      { page: 0, size: REQUESTED_ROLES_CEILING },
    );
    expect(REQUESTED_ROLES_CEILING).toBe(100);
  });
});
