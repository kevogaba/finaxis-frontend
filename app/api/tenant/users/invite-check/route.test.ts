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

  it("answers a revoked member's status for the trimmed email, and their name for the re-invite", async () => {
    findMemberByEmail.mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000011',
      email: 'hassan.ali@greenfield.example',
      username: 'hassan.ali',
      displayName: 'Hassan Ali',
      membershipStatus: 'REVOKED',
    });
    const response = await check('?email=%20hassan.ali%40greenfield.example%20');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // Only the status and the name: nothing else of the user's leaves the server.
    expect(await response.json()).toEqual({
      member: { membershipStatus: 'REVOKED', displayName: 'Hassan Ali' },
    });
    expect(findMemberByEmail).toHaveBeenCalledWith('hassan.ali@greenfield.example');
  });

  it.each(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'])(
    "answers a %s member's status without their name: the email is refused, not re-invited",
    async (membershipStatus) => {
      findMemberByEmail.mockResolvedValueOnce({
        id: '10000000-0000-4000-8000-000000000012',
        email: 'neema@greenfield.example',
        username: 'neema',
        displayName: 'Neema Wanjiku',
        membershipStatus,
      });
      expect(await (await check('?email=neema%40greenfield.example')).json()).toEqual({
        member: { membershipStatus },
      });
    },
  );

  it('answers null when no member has it', async () => {
    findMemberByEmail.mockResolvedValueOnce(null);
    expect(await (await check('?email=neema%40greenfield.example')).json()).toEqual({
      member: null,
    });
  });

  it.each([
    ['?email='],
    ['?email=%20%20'],
    [''],
    [`?email=${'a'.repeat(243)}%40example.com`], // 255 characters: one over RFC 5321's limit
    // A wildcard: `%` matches every user in the directory's search, so it is not an address.
    ['?email=%25'],
  ])('refuses %s without a read', async (query) => {
    expect((await check(query)).status).toBe(400);
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('refuses without a server-side session, before any read', async () => {
    requireAuthenticatedUser.mockRejectedValueOnce(new UnauthenticatedContextRequestError());
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('maps a stale institution context to 403, the refusal the wizard asks a reload for', async () => {
    findMemberByEmail.mockRejectedValueOnce(
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
    );
    expect((await check('?email=neema%40greenfield.example')).status).toBe(403);
  });

  it('checks an email of exactly 254 characters', async () => {
    findMemberByEmail.mockResolvedValueOnce(null);
    expect((await check(`?email=${'a'.repeat(242)}%40example.com`)).status).toBe(200);
  });

  it('maps a lost session to 401, a refusal to 403 and anything else to 502', async () => {
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(401));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(401);
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect((await check('?email=neema%40greenfield.example')).status).toBe(403);
    findMemberByEmail.mockRejectedValueOnce(new Error('schema drift'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = await check('?email=neema%40greenfield.example');
    expect(failed.status).toBe(502);
    // Never the error's own text.
    expect(JSON.stringify(await failed.json())).not.toContain('schema drift');
    // Logged by describeProblem (a minted support reference), so the failure isn't lost.
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
