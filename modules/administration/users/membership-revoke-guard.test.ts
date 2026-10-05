import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBERSHIP_CHANGED } from './user-rules';

const { apiPost, getAuthenticatedUser, getMembership } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  getAuthenticatedUser: vi.fn(),
  getMembership: vi.fn(),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('./user-service', () => ({
  getMembership: (id: string) => getMembership(id) as unknown,
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

  it.each(['ACTIVE', 'SUSPENDED', 'REVOKED'])(
    'refuses a Reject & revoke once the membership is %s, before the terminal call',
    async (status) => {
      getMembership.mockResolvedValue({ id: MEMBERSHIP, status });
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
    getMembership.mockResolvedValue({ id: MEMBERSHIP, status: 'PENDING_APPROVAL' });
    await expect(
      revokeMembership(null, reject({ expectedStatus: 'PENDING_APPROVAL' })),
    ).resolves.toEqual({ ok: true });
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
      { reason: 'Not our member' },
      KEY,
    );
  });

  it('reads nothing first for a plain Revoke (no expected status)', async () => {
    await expect(revokeMembership(null, reject())).resolves.toEqual({ ok: true });
    expect(getMembership).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown expected status before any read', async () => {
    const result = await revokeMembership(null, reject({ expectedStatus: 'APPROVED' }));
    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(getMembership).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
