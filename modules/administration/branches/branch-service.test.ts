import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, listAuditEvents } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listAuditEvents: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));

const service = await import('./branch-service');

const ID = '08000000-0000-4000-8000-000000000006';

describe('branch service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a branch by a validated id only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getBranch(ID);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/branches/${ID}`, expect.anything());
    await expect(service.getBranch('../../tenant')).rejects.toThrow();
    await expect(service.listBranchAssignments('../x', { page: 0, size: 10 })).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('counts active assignments with one size=1 read, and lets a failure reach load()', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 3 } });
    await expect(service.countActiveAssignments(ID)).resolves.toBe(3);
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/branch-assignments?branch_id=${ID}&status=ACTIVE&page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(service.countActiveAssignments(ID)).rejects.toThrow('service unavailable');
  });

  it('reads the drafter from the branch.create_draft audit event, or null (BG-08)', async () => {
    listAuditEvents.mockResolvedValueOnce({ items: [{ actorUserId: 'u-9' }], page: {} });
    await expect(service.getBranchMaker(ID)).resolves.toBe('u-9');
    expect(listAuditEvents).toHaveBeenCalledWith({
      entityType: 'BRANCH',
      entityId: ID,
      action: 'branch.create_draft',
      page: 0,
      size: 1,
    });
    listAuditEvents.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.getBranchMaker(ID)).resolves.toBeNull();
  });
});
