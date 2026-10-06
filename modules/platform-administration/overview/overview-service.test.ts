import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listPlatformUsers, listTenants } = vi.hoisted(() => ({
  listPlatformUsers: vi.fn(),
  listTenants: vi.fn(),
}));
vi.mock('../tenants/tenant-service', () => ({
  listTenants: (...args: unknown[]) => listTenants(...args) as unknown,
}));
vi.mock('../users/institution-user-service', () => ({
  listPlatformUsers: (...args: unknown[]) => listPlatformUsers(...args) as unknown,
}));

const service = await import('./overview-service');

const page = (totalItems: number) => ({ items: [], page: { totalItems } });

describe('overview service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews a status oldest first', async () => {
    const read = page(7);
    listTenants.mockResolvedValueOnce(read);
    await expect(service.listTenantsInStatus('PENDING_APPROVAL', 5)).resolves.toBe(read);
    expect(listTenants).toHaveBeenCalledTimes(1);
    expect(listTenants).toHaveBeenCalledWith({
      status: 'PENDING_APPROVAL',
      sort: { by: 'createdAt', dir: 'ASC' },
      page: 0,
      size: 5,
    });
  });

  it('counts a status from one size=1 read', async () => {
    listTenants.mockResolvedValueOnce(page(12));
    await expect(service.countTenantsInStatus('ACTIVE')).resolves.toBe(12);
    expect(listTenants).toHaveBeenCalledTimes(1);
    expect(listTenants).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', page: 0, size: 1 }),
    );
  });

  it('counts platform operators with an active account and membership', async () => {
    listPlatformUsers.mockResolvedValueOnce(page(4));
    await expect(service.countPlatformOperators()).resolves.toBe(4);
    expect(listPlatformUsers).toHaveBeenCalledTimes(1);
    expect(listPlatformUsers).toHaveBeenCalledWith({
      userStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      page: 0,
      size: 1,
    });
  });

  it('rejects when the read fails (the page shows the failure)', async () => {
    listTenants.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(service.listTenantsInStatus('DRAFT', 5)).rejects.toThrow('service unavailable');
    listTenants.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(service.countTenantsInStatus('SUSPENDED')).rejects.toThrow('service unavailable');
    listPlatformUsers.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(service.countPlatformOperators()).rejects.toThrow('service unavailable');
  });
});
