import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, requireAuthenticatedUser, searchTenantUsers } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  searchTenantUsers: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/auth/require-authenticated-user', () => ({
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError: class UnauthenticatedContextRequestError extends Error {},
}));
vi.mock('@/modules/administration/users/user-search-service', () => ({ searchTenantUsers }));

const { GET } = await import('./route');
const { UnauthenticatedContextRequestError } = await import('@/auth/require-authenticated-user');
const { BackendApiError } = await import('@/auth/backend-api');

const PETER = {
  id: '08000000-0000-4000-8000-000000000002',
  displayName: 'Peter Otieno',
  email: 'peter.otieno@greenfield.example',
  username: 'peter.otieno',
  membershipStatus: 'ACTIVE',
};
const search = (query: string) => GET(new Request(`http://localhost/api/tenant/users${query}`));

describe('GET /api/tenant/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    requireAuthenticatedUser.mockResolvedValue({});
  });

  it('returns the first page of matches for a trimmed query', async () => {
    searchTenantUsers.mockResolvedValueOnce([PETER]);
    const response = await search('?q=%20pet%20');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [PETER] });
    expect(searchTenantUsers).toHaveBeenCalledWith('pet');
  });

  it('refuses without a server-side session', async () => {
    requireAuthenticatedUser.mockRejectedValueOnce(new UnauthenticatedContextRequestError());
    expect((await search('?q=pet')).status).toBe(401);
    expect(searchTenantUsers).not.toHaveBeenCalled();
  });

  it('maps a lost context or missing permission to 403 and anything else to 502', async () => {
    searchTenantUsers.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect((await search('?q=pet')).status).toBe(403);
    searchTenantUsers.mockRejectedValueOnce(new Error('schema drift'));
    expect((await search('?q=pet')).status).toBe(502);
  });
});
