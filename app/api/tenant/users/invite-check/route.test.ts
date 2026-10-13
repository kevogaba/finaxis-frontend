import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, requireAuthenticatedUser, findMemberByEmail } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  findMemberByEmail: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/auth/require-authenticated-user', () => ({
  requireAuthenticatedUser,
  UnauthenticatedContextRequestError: class UnauthenticatedContextRequestError extends Error {},
}));
vi.mock('@/modules/administration/users/invite-service', () => ({ findMemberByEmail }));

const { GET } = await import('./route');
const { UnauthenticatedContextRequestError } = await import('@/auth/require-authenticated-user');
const { BackendApiError } = await import('@/auth/backend-api');

const check = (query: string) =>
  GET(new Request(`http://localhost/api/tenant/users/invite-check${query}`));

describe('GET /api/tenant/users/invite-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    requireAuthenticatedUser.mockResolvedValue({});
  });

  it('answers the membership status the trimmed email already has here', async () => {
    findMemberByEmail.mockResolvedValueOnce({ membershipStatus: 'REVOKED' });
    const response = await check('?email=%20hassan.ali%40greenfield.example%20');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ membershipStatus: 'REVOKED' });
    expect(findMemberByEmail).toHaveBeenCalledWith('hassan.ali@greenfield.example');
  });

  it('answers null when no member has it', async () => {
    findMemberByEmail.mockResolvedValueOnce(null);
    expect(await (await check('?email=neema%40greenfield.example')).json()).toEqual({
      membershipStatus: null,
    });
  });

  it.each([['?email='], ['?email=%20%20'], [''], [`?email=${'a'.repeat(255)}`]])(
    'refuses %s without a read',
    async (query) => {
      expect((await check(query)).status).toBe(400);
      expect(findMemberByEmail).not.toHaveBeenCalled();
    },
  );

  it('refuses without a server-side session, before any read', async () => {
    requireAuthenticatedUser.mockRejectedValueOnce(new UnauthenticatedContextRequestError());
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('maps a lost session to 401, a refusal to 403 and anything else to 502', async () => {
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(401));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(403);
    findMemberByEmail.mockRejectedValueOnce(new Error('schema drift'));
    const failed = await check('?email=neema%40greenfield.example');
    expect(failed.status).toBe(502);
    // Never the error's own text.
    expect(JSON.stringify(await failed.json())).not.toContain('schema drift');
  });
});
