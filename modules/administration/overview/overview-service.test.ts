import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { membershipPageSchema } from '@/modules/administration/users/user-contract';

const { apiGet, listAuditEvents, listBranches } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listAuditEvents: vi.fn(),
  listBranches: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));
vi.mock('@/modules/administration/audit/audit-service', () => ({
  listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
}));
vi.mock('@/modules/administration/branches/branch-service', () => ({
  listBranches: (...args: unknown[]) => listBranches(...args) as unknown,
}));

const service = await import('./overview-service');

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

describe('overview service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('counts active branches with one size=1 read (BG-15)', async () => {
    listBranches.mockResolvedValue(total(2));
    await expect(service.countActiveBranches()).resolves.toBe(2);
    expect(listBranches).toHaveBeenCalledExactlyOnceWith({
      status: 'ACTIVE',
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 1,
    });
  });

  it('counts active memberships with one size=1 read, through the users contract', async () => {
    apiGet.mockResolvedValue(total(1));
    await expect(service.countActiveMemberships()).resolves.toBe(1);
    expect(apiGet).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/tenant/memberships?membership_status=ACTIVE&page=0&size=1',
      membershipPageSchema,
    );
  });

  it('reads the five newest audit events', async () => {
    listAuditEvents.mockResolvedValue(total(30));
    await service.listRecentActivity();
    expect(listAuditEvents).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 5 });
  });

  it("rejects with the read's own error, for the card's load() (rule 6)", async () => {
    const error = new BackendApiError(403, { code: 'forbidden' });
    listBranches.mockRejectedValue(error);
    apiGet.mockRejectedValue(error);
    listAuditEvents.mockRejectedValue(error);
    await expect(service.countActiveBranches()).rejects.toBe(error);
    await expect(service.countActiveMemberships()).rejects.toBe(error);
    await expect(service.listRecentActivity()).rejects.toBe(error);
  });
});
