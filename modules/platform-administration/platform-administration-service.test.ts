import { beforeEach, describe, expect, it, vi } from 'vitest';

const { backendApi, readContextToken } = vi.hoisted(() => ({
  backendApi: { get: vi.fn() },
  readContextToken: vi.fn(),
}));

vi.mock('@/auth/backend-api', () => ({ backendApi }));
vi.mock('@/auth/context-cookie', () => ({ readContextToken }));

const { platformAdministrationService } = await import('./platform-administration-service');

describe('platformAdministrationService', () => {
  const headers = new Headers({ cookie: 'finaxis.context_token=signed-context' });

  beforeEach(() => {
    vi.clearAllMocks();
    readContextToken.mockResolvedValue('signed-context');
    backendApi.get.mockResolvedValue({ items: [], page: {} });
  });

  it('reads tenants through the platform endpoint with encoded pagination and filters', async () => {
    await platformAdministrationService.listTenants(headers, {
      q: 'Acme Ltd',
      page: 2,
      size: 50,
      status: 'ACTIVE',
      country: 'KE',
      createdFrom: '2026-01-01',
      createdTo: '2026-07-26',
      sortBy: 'displayName',
      sortDir: 'desc',
    });

    expect(backendApi.get).toHaveBeenCalledWith(
      '/api/v1/platform/tenants?q=Acme+Ltd&status=ACTIVE&country=KE&created_from=2026-01-01&created_to=2026-07-26&page=2&size=50&sort_by=displayName&sort_dir=desc',
      headers,
      'signed-context',
    );
  });

  it('reads related tenant resources and audit detail with the context token', async () => {
    await platformAdministrationService.getTenant(headers, '11111111-1111-1111-1111-111111111111');
    await platformAdministrationService.listTenantUsers(
      headers,
      '11111111-1111-1111-1111-111111111111',
      { q: 'smith', userStatus: 'ACTIVE', page: 1, size: 10, membershipStatus: 'ACTIVE' },
    );
    await platformAdministrationService.getAuditEvent(
      headers,
      '22222222-2222-2222-2222-222222222222',
    );

    expect(backendApi.get).toHaveBeenNthCalledWith(
      1,
      '/api/v1/platform/tenants/11111111-1111-1111-1111-111111111111',
      headers,
      'signed-context',
    );
    expect(backendApi.get).toHaveBeenNthCalledWith(
      2,
      '/api/v1/platform/tenants/11111111-1111-1111-1111-111111111111/users?q=smith&user_status=ACTIVE&membership_status=ACTIVE&page=1&size=10',
      headers,
      'signed-context',
    );
    expect(backendApi.get).toHaveBeenNthCalledWith(
      3,
      '/api/v1/tenant/audit-events/22222222-2222-2222-2222-222222222222',
      headers,
      'signed-context',
    );
  });

  it('covers branch, user detail, and audit list read paths', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const resourceId = '22222222-2222-2222-2222-222222222222';
    await platformAdministrationService.getTenantUser(headers, tenantId, resourceId);
    await platformAdministrationService.listTenantBranches(headers, tenantId, {
      page: 2,
      size: 20,
      q: 'head',
      status: 'ACTIVE',
      type: 'HEAD_OFFICE',
      sortBy: 'branchName',
      sortDir: 'desc',
    });
    await platformAdministrationService.getTenantBranch(headers, tenantId, resourceId);
    await platformAdministrationService.listAuditEvents(headers, {
      actorId: resourceId,
      entityType: 'TENANT',
      entityId: resourceId,
      action: 'UPDATE',
      occurredFrom: '2026-07-01T00:00:00Z',
      occurredTo: '2026-07-26T23:59:59Z',
      page: 1,
      size: 10,
    });

    expect(backendApi.get).toHaveBeenNthCalledWith(
      1,
      `/api/v1/platform/tenants/${tenantId}/users/${resourceId}`,
      headers,
      'signed-context',
    );
    expect(backendApi.get).toHaveBeenNthCalledWith(
      2,
      `/api/v1/platform/tenants/${tenantId}/branches?q=head&status=ACTIVE&type=HEAD_OFFICE&page=2&size=20&sort_by=branchName&sort_dir=desc`,
      headers,
      'signed-context',
    );
    expect(backendApi.get).toHaveBeenNthCalledWith(
      3,
      `/api/v1/platform/tenants/${tenantId}/branches/${resourceId}`,
      headers,
      'signed-context',
    );
    expect(backendApi.get).toHaveBeenNthCalledWith(
      4,
      `/api/v1/tenant/audit-events?entity_type=TENANT&entity_id=${resourceId}&actor_id=${resourceId}&action=UPDATE&occurred_from=2026-07-01T00%3A00%3A00Z&occurred_to=2026-07-26T23%3A59%3A59Z&page=1&size=10`,
      headers,
      'signed-context',
    );
  });

  it('rejects invalid identifiers and missing context before a backend call', async () => {
    expect(() => platformAdministrationService.getTenant(headers, 'not-a-uuid')).toThrow();
    readContextToken.mockResolvedValueOnce(null);
    await expect(
      platformAdministrationService.getTenant(headers, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow('selected platform context');
    expect(backendApi.get).not.toHaveBeenCalled();
  });

  it('validates every route identifier before reading', () => {
    expect(() =>
      platformAdministrationService.listTenantUsers(headers, 'not-a-uuid', {}),
    ).toThrow();
    expect(() =>
      platformAdministrationService.listTenantBranches(headers, 'not-a-uuid', {}),
    ).toThrow();
    expect(() =>
      platformAdministrationService.getTenantBranch(
        headers,
        'not-a-uuid',
        '22222222-2222-2222-2222-222222222222',
      ),
    ).toThrow();
    expect(() =>
      platformAdministrationService.getTenantUser(
        headers,
        'not-a-uuid',
        '22222222-2222-2222-2222-222222222222',
      ),
    ).toThrow();
    expect(() =>
      platformAdministrationService.getTenantUser(
        headers,
        '11111111-1111-1111-1111-111111111111',
        'not-a-uuid',
      ),
    ).toThrow();
    expect(() =>
      platformAdministrationService.getTenantBranch(
        headers,
        '11111111-1111-1111-1111-111111111111',
        'not-a-uuid',
      ),
    ).toThrow();
    expect(() => platformAdministrationService.getAuditEvent(headers, 'not-a-uuid')).toThrow();
    expect(backendApi.get).not.toHaveBeenCalled();
  });

  it('exposes only read methods for Stage 1', () => {
    expect(Object.keys(platformAdministrationService).sort()).toEqual([
      'getAuditEvent',
      'getTenant',
      'getTenantBranch',
      'getTenantUser',
      'listAuditEvents',
      'listTenantBranches',
      'listTenantUsers',
      'listTenants',
    ]);
    expect('post' in platformAdministrationService).toBe(false);
    expect('patch' in platformAdministrationService).toBe(false);
  });
});
