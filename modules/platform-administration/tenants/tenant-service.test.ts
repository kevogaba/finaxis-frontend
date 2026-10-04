import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const service = await import('./tenant-service');

const ACME = '99999999-9999-4999-8999-999999999999';

describe('tenant service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists tenants through the allow-listed path', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listTenants({
      q: 'acme',
      sort: { by: 'displayName', dir: 'ASC' },
      page: 1,
      size: 20,
    });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/platform/tenants?q=acme&sort_by=displayName&sort_dir=ASC&page=1&size=20',
      expect.anything(),
    );
  });

  it('reads a tenant by a validated id only; a malformed id rejects (a load() failure)', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getTenant(ACME);
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/platform/tenants/${ACME}`, expect.anything());
    await expect(service.getTenant('../../tenant')).rejects.toThrow();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('finds a taken tenant code among up to 100 substring matches, ignoring case (BG-07)', async () => {
    apiGet.mockResolvedValueOnce({
      items: [{ tenantCode: 'acme-2' }, { tenantCode: 'ACME' }],
      page: {},
    });
    await expect(service.tenantCodeTaken('acme')).resolves.toBe(true);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/platform/tenants?q=acme&page=0&size=100',
      expect.anything(),
    );
    apiGet.mockResolvedValueOnce({ items: [{ tenantCode: 'acme-2' }], page: {} });
    await expect(service.tenantCodeTaken('acme')).resolves.toBe(false);
  });
});
