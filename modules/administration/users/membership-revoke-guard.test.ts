import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { MEMBERSHIP_CHANGED } from './user-rules';

const { apiPost, getAuthenticatedUser, getMembership, getUser } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  getAuthenticatedUser: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('./user-service', () => ({
  getMembership: (id: string) => getMembership(id) as unknown,
  getUser: (id: string) => getUser(id) as unknown,
}));
// The real runServerAction runs here, so its own reads are mocked.
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: vi.fn(),
}));

const { revokeMembership } = await import('./membership-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const MEMBERSHIP = '20000000-0000-4000-8000-000000000001';
const USER = '10000000-0000-4000-8000-00000000000d';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const reject = (extra: Record<string, string> = {}) =>
  form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'Not our member', ...extra });

/** Layer 12, P-3: the user record's Reject & revoke names the status it was offered for, so a stale
 * tab never revokes (terminally, BG-28) a member another administrator approved meanwhile. */
describe('revokeMembership with an expected status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
  });

  it.each(['ACTIVE', 'SUSPENDED'])(
    'refuses a Reject & revoke once the membership is %s, before the terminal call',
    async (status) => {
      getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status });
      await expect(
        revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
      ).resolves.toMatchObject({
        ok: false,
        code: 'membership_changed',
        formError: MEMBERSHIP_CHANGED,
      });
      expect(getMembership).toHaveBeenCalledExactlyOnceWith(MEMBERSHIP);
      expect(apiPost).not.toHaveBeenCalled();
    },
  );

  it('revokes while the membership is still in the expected status', async () => {
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'PENDING_APPROVAL' });
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
      { reason: 'Not our member' },
      KEY,
    );
    // No rendered user status was named, so the user is not read.
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses once another administrator approved it into identity provisioning (202)', async () => {
    // A 202 approval keeps the membership PENDING_APPROVAL and moves only the user (contract §E.3).
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'PENDING_APPROVAL' });
    getUser.mockResolvedValue({ id: USER, userStatus: 'PROVISIONING_IDP' });
    await expect(
      revokeMembership(
        null,
        reject({ expectedStatus: 'PENDING_APPROVAL', expectedUserStatus: 'DRAFT' }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: 'membership_changed',
      formError: MEMBERSHIP_CHANGED,
    });
    expect(getUser).toHaveBeenCalledExactlyOnceWith(USER);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('still revokes a membership the page showed as provisioning', async () => {
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'PENDING_APPROVAL' });
    getUser.mockResolvedValue({ id: USER, userStatus: 'PROVISIONING_IDP' });
    await expect(
      revokeMembership(
        null,
        reject({ expectedStatus: 'PENDING_APPROVAL', expectedUserStatus: 'PROVISIONING_IDP' }),
      ),
    ).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledTimes(1);
    // The page already showed provisioning, so nothing could have changed to compare against.
    expect(getUser).not.toHaveBeenCalled();
  });

  it('still revokes while the user is not provisioning either', async () => {
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'PENDING_APPROVAL' });
    getUser.mockResolvedValue({ id: USER, userStatus: 'DRAFT' });
    await expect(
      revokeMembership(
        null,
        reject({ expectedStatus: 'PENDING_APPROVAL', expectedUserStatus: 'DRAFT' }),
      ),
    ).resolves.toEqual({ ok: true });
    expect(getUser).toHaveBeenCalledExactlyOnceWith(USER);
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('lets a revoked membership through, so a same-key retry replays its success', async () => {
    // REVOKED is the revoke's own end state: maybe this key's earlier revoke whose response was
    // lost, which the backend replays; anyone else's revoke answers 500 (REVOKE_FAILED).
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'REVOKED' });
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
      { reason: 'Not our member' },
      KEY,
    );
  });

  it.each([
    ['a lost session', new BackendApiError(401), 'NEXT_REDIRECT:/login?reason=session_expired'],
    [
      'a stale context',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      'NEXT_REDIRECT:/select-context',
    ],
  ])('redirects when the guard read finds %s, and never revokes', async (_case, error, to) => {
    getMembership.mockRejectedValueOnce(error);
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).rejects.toThrow(to);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('fails closed when the guard read fails, keeping its reference', async () => {
    getMembership.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-1' }));
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).resolves.toMatchObject({ ok: false, requestId: 'req-1' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('fails closed when the user read behind the guard fails, and never revokes', async () => {
    getMembership.mockResolvedValue({ id: MEMBERSHIP, userId: USER, status: 'PENDING_APPROVAL' });
    getUser.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-2' }));
    await expect(
      revokeMembership(
        null,
        reject({ expectedStatus: 'PENDING_APPROVAL', expectedUserStatus: 'DRAFT' }),
      ),
    ).resolves.toMatchObject({ ok: false, requestId: 'req-2' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('reads nothing first for a plain Revoke (no expected status)', async () => {
    await expect(revokeMembership(null, reject())).resolves.toEqual({ ok: true });
    expect(getMembership).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown expected status before any read', async () => {
    const result = await revokeMembership(null, reject({ expectedStatus: 'APPROVED' }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getMembership).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('refuses an unknown expected user status before any read', async () => {
    const result = await revokeMembership(
      null,
      reject({ expectedStatus: 'PENDING_APPROVAL', expectedUserStatus: 'APPROVED' }),
    );
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getMembership).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
