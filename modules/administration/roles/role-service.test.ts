import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const service = await import('./role-service');

const ROLE = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';

describe('role service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads by validated ids only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getRole(ROLE);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/tenant/roles/${ROLE}`, expect.anything());
    await expect(service.getRole('../../tenant')).rejects.toThrow();
    await expect(service.listRolePermissions('../x', { page: 0, size: 10 })).rejects.toThrow();
    await expect(
      service.listRoleAssignments({ userId: 'not-a-uuid' }, { page: 0, size: 10 }),
    ).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('lists role assignments with snake_case filters (10 and 12 read by user)', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listRoleAssignments(
      { userId: USER, scopeType: 'BRANCH', status: 'ACTIVE' },
      { page: 1, size: 20 },
    );
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/role-assignments?user_id=${USER}&scope_type=BRANCH&status=ACTIVE&page=1&size=20`,
      expect.anything(),
    );
  });

  it('counts with one size=1 read each, or null when unreadable (BG-15)', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 4 } });
    await expect(service.countRolePermissions(ROLE)).resolves.toBe(4);
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions?page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockResolvedValueOnce({ items: [], page: { totalItems: 2 } });
    await expect(service.countActiveRoleAssignments(ROLE)).resolves.toBe(2);
    expect(apiGet).toHaveBeenLastCalledWith(
      `/api/v1/tenant/role-assignments?role_id=${ROLE}&status=ACTIVE&page=0&size=1`,
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.countRolePermissions(ROLE)).resolves.toBeNull();
  });

  it('reads the whole catalogue in one bounded, code-sorted read — or null', async () => {
    const page = { items: [], page: { hasNext: false } };
    apiGet.mockResolvedValueOnce(page);
    await expect(service.getPermissionCatalogue()).resolves.toBe(page);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/permissions?page=0&size=100&sort_by=permissionCode&sort_dir=ASC',
      expect.anything(),
    );
    apiGet.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.getPermissionCatalogue()).resolves.toBeNull();
  });

  it('collects every granted code in one bounded read', async () => {
    apiGet.mockResolvedValueOnce({
      items: [{ permissionCode: 'cob.start' }, { permissionCode: 'branch.view' }],
      page: {},
    });
    await expect(service.listGrantedCodes(ROLE)).resolves.toEqual(
      new Set(['cob.start', 'branch.view']),
    );
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions?page=0&size=100`,
      expect.anything(),
    );
  });
});
