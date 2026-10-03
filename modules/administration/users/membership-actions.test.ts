import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type * as ActionResultModule from '@/lib/api/action-result';

const { apiPost, getAuthenticatedUser, getCurrentContextProfile, runServerAction } = vi.hoisted(
  () => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    getAuthenticatedUser: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    runServerAction: vi.fn(),
  }),
);
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
// The real runServerAction (loaded below, for the cross-tab guard tests) reads these.
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
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));

const actions = await import('./membership-actions');
const realRunServerAction = (
  await vi.importActual<typeof ActionResultModule>('@/lib/api/action-result')
).runServerAction;

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const MEMBERSHIP = '20000000-0000-4000-8000-000000000001';
const ORGANISATION = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANISATION = '22222222-2222-4222-8222-222222222222';

const APPROVE_FORBIDDEN =
  "You can't approve this user. Your role may not allow it, or you invited them — a different administrator must approve them.";
const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment, or approval may already have run. Refresh and check.";
const REVOKE_FAILED =
  "This membership couldn't be revoked. It may already be revoked — refresh and check.";

const ACTION_NAMES = [
  'approveMembership',
  'suspendMembership',
  'reactivateMembership',
  'revokeMembership',
] as const;
const PATHS = {
  approveMembership: 'activate',
  suspendMembership: 'suspend',
  reactivateMembership: 'reactivate',
  revokeMembership: 'revoke',
} as const;

type Run = (input: unknown) => Promise<unknown>;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const failure = (code: string) => ({
  ok: false as const,
  formError: 'generic',
  fieldErrors: {},
  code,
  requestId: 'req-1',
});

describe('membership actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A validating pass-through: this file covers fields, bodies and messages (a schema failure
    // returns a result, like the real one); runServerAction has its own test.
    runServerAction.mockImplementation(async (schema: z.ZodType, formData: FormData, run: Run) => {
      const parsed = schema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) {
        return {
          ok: false,
          formError: 'invalid',
          fieldErrors: Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
          ),
          code: 'validation_failed',
          requestId: null,
        };
      }
      await run(parsed.data);
      return { ok: true };
    });
  });

  describe('approveMembership', () => {
    it('approves with an empty body on the activate path, forwarding the form key', async () => {
      await actions.approveMembership(
        null,
        form({ idempotencyKey: KEY, membershipId: MEMBERSHIP }),
      );
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/activate`,
        {},
        KEY,
      );
    });

    it('never sends a reason: the endpoint reads no body', async () => {
      await actions.approveMembership(
        null,
        form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'Looks fine' }),
      );
      expect(apiPost).toHaveBeenCalledWith(expect.any(String), {}, KEY);
    });

    it('explains a 403 as permission or maker-checker, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('forbidden'));
      expect(await actions.approveMembership(null, form({}))).toEqual({
        ...failure('forbidden'),
        formError: APPROVE_FORBIDDEN,
      });
    });

    it('explains a 500 with the likely causes, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('internal_error'));
      expect(await actions.approveMembership(null, form({}))).toEqual({
        ...failure('internal_error'),
        formError: APPROVE_FAILED,
      });
    });

    it('leaves other failure codes alone', async () => {
      for (const code of ['conflict', 'not_found', 'context_changed']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.approveMembership(null, form({}))).toEqual(failure(code));
      }
    });
  });

  describe('suspendMembership', () => {
    it('suspends with the trimmed reason', async () => {
      await actions.suspendMembership(
        null,
        form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: '  Cash audit  ' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/suspend`,
        { reason: 'Cash audit' },
        KEY,
      );
    });

    it('leaves other failure codes alone', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.suspendMembership(null, form({}))).toEqual(failure('conflict'));
    });
  });

  describe('reactivateMembership', () => {
    it('reactivates with {} for a blank or absent reason and { reason } otherwise', async () => {
      const path = `/api/v1/tenant/memberships/${MEMBERSHIP}/reactivate`;
      const base = { idempotencyKey: KEY, membershipId: MEMBERSHIP };

      await actions.reactivateMembership(null, form({ ...base, reason: '   ' }));
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      await actions.reactivateMembership(null, form(base));
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      await actions.reactivateMembership(null, form({ ...base, reason: ' Audit cleared ' }));
      expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'Audit cleared' }, KEY);
      expect(apiPost).toHaveBeenCalledTimes(3);
    });

    it('accepts a one-letter reason (the reason is optional)', async () => {
      await actions.reactivateMembership(
        null,
        form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'a' }),
      );
      expect(apiPost).toHaveBeenCalledWith(expect.any(String), { reason: 'a' }, KEY);
    });

    it('leaves failure codes alone', async () => {
      runServerAction.mockResolvedValueOnce(failure('internal_error'));
      expect(await actions.reactivateMembership(null, form({}))).toEqual(failure('internal_error'));
    });
  });

  describe('revokeMembership', () => {
    it('revokes with the reason', async () => {
      await actions.revokeMembership(
        null,
        form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: ' Left the SACCO ' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/revoke`,
        { reason: 'Left the SACCO' },
        KEY,
      );
    });

    it('explains a 500 as possibly already revoked, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('internal_error'));
      expect(await actions.revokeMembership(null, form({}))).toEqual({
        ...failure('internal_error'),
        formError: REVOKE_FAILED,
      });
    });

    it('leaves other failure codes alone', async () => {
      for (const code of ['conflict', 'forbidden']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.revokeMembership(null, form({}))).toEqual(failure(code));
      }
    });
  });

  describe.each(['suspendMembership', 'revokeMembership'] as const)('%s reason', (name) => {
    const fields = { idempotencyKey: KEY, membershipId: MEMBERSHIP };

    it('refuses a reason under 3 characters after trimming, before any call', async () => {
      const result = await actions[name](null, form({ ...fields, reason: '  a  ' }));
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('refuses a missing reason, before any call', async () => {
      const result = await actions[name](null, form(fields));
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      expect(result.ok ? null : result.fieldErrors.reason).toEqual(expect.any(String));
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('refuses a reason over 500 characters, before any call', async () => {
      const result = await actions[name](null, form({ ...fields, reason: 'x'.repeat(501) }));
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Keep the reason under 500 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('accepts exactly 3 and exactly 500 characters', async () => {
      await actions[name](null, form({ ...fields, reason: 'abc' }));
      await actions[name](null, form({ ...fields, reason: 'x'.repeat(500) }));
      expect(apiPost).toHaveBeenCalledTimes(2);
    });
  });

  it('refuses a reason over 500 characters on reactivate too', async () => {
    const result = await actions.reactivateMembership(
      null,
      form({ idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'x'.repeat(501) }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { reason: 'Keep the reason under 500 characters.' },
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  describe.each(ACTION_NAMES)('%s', (name) => {
    const fields = { idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'Cash audit' };

    it.each(['../x', 'not-a-uuid', '', `${MEMBERSHIP}/../revoke`])(
      'refuses the membership id %j with no backend call',
      async (membershipId) => {
        const result = await actions[name](null, form({ ...fields, membershipId }));
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
        expect(result.ok ? null : result.fieldErrors.membershipId).toEqual(expect.any(String));
        expect(apiPost).not.toHaveBeenCalled();
      },
    );

    it('refuses a missing or malformed idempotency key with no backend call', async () => {
      for (const idempotencyKey of ['', 'not-a-key']) {
        const result = await actions[name](null, form({ ...fields, idempotencyKey }));
        expect(result.ok ? null : result.fieldErrors.idempotencyKey).toEqual(expect.any(String));
      }
      const absent = await actions[name](
        null,
        form({ membershipId: MEMBERSHIP, reason: 'Cash audit' }),
      );
      expect(absent.ok ? null : absent.fieldErrors.idempotencyKey).toEqual(expect.any(String));
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('forwards the form-minted idempotency key, never a fresh one', async () => {
      await actions[name](null, form(fields));
      await actions[name](
        null,
        form({ ...fields, idempotencyKey: '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b' }),
      );
      expect(apiPost.mock.calls.map(([path, , key]) => [path, key])).toEqual([
        [`/api/v1/tenant/memberships/${MEMBERSHIP}/${PATHS[name]}`, KEY],
        [
          `/api/v1/tenant/memberships/${MEMBERSHIP}/${PATHS[name]}`,
          '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
        ],
      ]);
    });

    it('hands the submitted form, with its cross-tab guard field, to runServerAction', async () => {
      const submitted = form({ ...fields, contextOrganisationId: ORGANISATION });
      await actions[name](null, submitted);
      expect(runServerAction).toHaveBeenCalledTimes(1);
      expect(runServerAction.mock.calls[0]?.[1]).toBe(submitted);
      expect(submitted.get('contextOrganisationId')).toBe(ORGANISATION);
    });

    describe('with the real runServerAction (the cross-tab guard, I2)', () => {
      beforeEach(() => {
        runServerAction.mockImplementation(realRunServerAction);
        getAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
      });

      it('refuses a submit after an organisation switch, before any backend call', async () => {
        getCurrentContextProfile.mockResolvedValueOnce({
          kind: 'resolved',
          context: { organization: { id: OTHER_ORGANISATION } },
        });
        const result = await actions[name](
          null,
          form({ ...fields, contextOrganisationId: ORGANISATION }),
        );
        expect(result).toMatchObject({ ok: false, code: 'context_changed' });
        expect(apiPost).not.toHaveBeenCalled();
      });

      it('runs when the rendered organisation still matches, with the form key', async () => {
        getCurrentContextProfile.mockResolvedValueOnce({
          kind: 'resolved',
          context: { organization: { id: ORGANISATION } },
        });
        const result = await actions[name](
          null,
          form({ ...fields, contextOrganisationId: ORGANISATION }),
        );
        expect(result).toEqual({ ok: true });
        expect(apiPost).toHaveBeenCalledWith(
          `/api/v1/tenant/memberships/${MEMBERSHIP}/${PATHS[name]}`,
          expect.any(Object),
          KEY,
        );
      });
    });
  });
});
