import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const { getAuditEvent, listAuditEvents } = await import('./audit-service');

describe('audit service', () => {
  it('lists events through the validated page schema', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: { number: 0 } });
    await listAuditEvents({ entityType: 'USER', page: 0, size: 20 });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/audit-events?entity_type=USER&page=0&size=20',
      expect.anything(),
    );
  });

  it('refuses a non-UUID event id before calling the backend', async () => {
    await expect(getAuditEvent('../../etc')).rejects.toThrow();
    expect(apiGet).not.toHaveBeenCalledWith(expect.stringContaining('etc'), expect.anything());
  });
});
