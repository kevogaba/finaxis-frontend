import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import { userPageSchema, userSummarySchema } from '@/modules/administration/users/user-contract';
import { parseUserListQuery } from '@/modules/administration/users/user-query';
import { institutionUserListApiPath } from './institution-user-query';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));
// BG-10: the platform organisation's id, a literal because vi.mock is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));

const service = await import('./institution-user-service');

// Lettered, so each id's upper case differs from it.
const TENANT = '17000000-0000-4000-8000-0000000000ab';
const USER = '17000000-0000-4000-8000-0000000000a5';
const PLATFORM = '00000000-0000-0000-0000-000000000000';
const QUERY = parseUserListQuery(new URLSearchParams('q=achieng&userStatus=ACTIVE&page=1'));

describe('institution user service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists an institution's users", async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listInstitutionUsers(TENANT.toUpperCase(), QUERY);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]?.[0]).toBe(institutionUserListApiPath(TENANT, QUERY));
    expect(apiGet.mock.calls[0]?.[0]).toContain(`/api/v1/platform/tenants/${TENANT}/users?`);
    expect(apiGet.mock.calls[0]?.[1]).toBe(userPageSchema);
  });

  it('reads one user through the institution', async () => {
    apiGet.mockResolvedValueOnce({});
    await service.getInstitutionUser(TENANT.toUpperCase(), USER.toUpperCase());
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]?.[0]).toBe(`/api/v1/platform/tenants/${TENANT}/users/${USER}`);
    expect(apiGet.mock.calls[0]?.[1]).toBe(userSummarySchema);
  });

  it('lists and reads platform users through the platform organisation (BG-10)', async () => {
    apiGet.mockResolvedValueOnce({ items: [], page: {} });
    await service.listPlatformUsers(QUERY);
    expect(apiGet.mock.calls[0]?.[0]).toBe(institutionUserListApiPath(PLATFORM, QUERY));
    expect(apiGet.mock.calls[0]?.[0]).toContain(`/api/v1/platform/tenants/${PLATFORM}/users?`);
    expect(apiGet.mock.calls[0]?.[1]).toBe(userPageSchema);

    apiGet.mockResolvedValueOnce({});
    await service.getPlatformUser(USER);
    expect(apiGet.mock.calls[1]?.[0]).toBe(`/api/v1/platform/tenants/${PLATFORM}/users/${USER}`);
    expect(apiGet.mock.calls[1]?.[1]).toBe(userSummarySchema);
  });

  it('rejects a malformed id before any call', async () => {
    await expect(service.listInstitutionUsers('../x', QUERY)).rejects.toThrow();
    await expect(service.getInstitutionUser(TENANT, 'not-a-uuid')).rejects.toThrow();
    await expect(service.getInstitutionUser('../x', USER)).rejects.toThrow();
    await expect(service.getPlatformUser('../x')).rejects.toThrow();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
