import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type * as ActionResultModule from '@/lib/api/action-result';
import {
  ACCOUNT_CHANGED,
  CONFIRM_USERNAME_MISMATCH,
  OWN_ACCOUNT,
  OWN_ACCOUNT_CODE,
} from './account-rules';

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
// The real runServerAction (loaded below, for the guard tests) reads these.
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

const actions = await import('./account-actions');
const realRunServerAction = (
  await vi.importActual<typeof ActionResultModule>('@/lib/api/action-result')
).runServerAction;

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_KEY = '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const USER = '17000000-0000-4000-8000-0000000000a5';
// Lettered, so its upper case differs from it.
const SELF = '17000000-0000-4000-8000-0000000000ef';
const ORGANISATION = '00000000-0000-0000-0000-000000000000';
const OTHER = '11111111-1111-4111-8111-111111111111';

const ACTION_NAMES = ['suspendAccount', 'reactivateAccount', 'deactivateAccount'] as const;
const PATHS = {
  suspendAccount: 'suspend',
  reactivateAccount: 'reactivate',
  deactivateAccount: 'deactivate',
} as const;
/** Valid input for each action: a reason for every one, and the username typed back for Deactivate. */
const VALID = {
  idempotencyKey: KEY,
  userId: USER,
  reason: 'Fraud review',
  username: 'achieng.odera',
  confirmUsername: 'achieng.odera',
};

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

const resolvedProfile = (organisationId: string) => ({
  kind: 'resolved' as const,
  profile: { user_id: SELF, permissions: [] },
  context: { organization: { id: organisationId, name: 'Platform' } },
});

describe('account actions', () => {
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
    // After the pass-through: Suspend and Deactivate read who you are inside `run`
    // (refuseOwnAccount), and the pass-through runs `run`. Without a profile, `selected.kind` on
    // `undefined` throws before any assertion. Reactivate never reads it.
    getCurrentContextProfile.mockResolvedValue(resolvedProfile(ORGANISATION));
  });

  describe('suspendAccount', () => {
    it('suspends with the trimmed reason, forwarding the form key', async () => {
      await actions.suspendAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER.toUpperCase(), reason: '  Fraud review  ' }),
      );
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/platform/users/${USER}/suspend`,
        { reason: 'Fraud review' },
        KEY,
      );
    });

    it('refuses a reason under 3 characters after trimming, before any call', async () => {
      const result = await actions.suspendAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: '  a  ' }),
      );
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('refuses a reason over 500 characters, before any call', async () => {
      const result = await actions.suspendAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: 'x'.repeat(501) }),
      );
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Keep the reason under 500 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('explains a 409 as a changed account, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.suspendAccount(null, form({}))).toEqual({
        ...failure('conflict'),
        formError: ACCOUNT_CHANGED,
      });
    });

    it('leaves other failure codes alone', async () => {
      for (const code of ['forbidden', 'internal_error', 'context_changed']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.suspendAccount(null, form({}))).toEqual(failure(code));
      }
    });
  });

  describe('reactivateAccount', () => {
    it('sends {} for a blank reason and { reason } otherwise (the body is required)', async () => {
      const path = `/api/v1/platform/users/${USER}/reactivate`;
      await actions.reactivateAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: '   ' }),
      );
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      await actions.reactivateAccount(null, form({ idempotencyKey: KEY, userId: USER }));
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      await actions.reactivateAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: ' Review closed ' }),
      );
      expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'Review closed' }, KEY);
    });

    it('refuses a reason over 500 characters, before any call', async () => {
      const result = await actions.reactivateAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: 'x'.repeat(501) }),
      );
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Keep the reason under 500 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('allows reactivating without consulting who you are', async () => {
      await actions.reactivateAccount(null, form({ idempotencyKey: KEY, userId: SELF }));
      expect(getCurrentContextProfile).not.toHaveBeenCalled();
      expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it('explains a 409 as a changed account, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.reactivateAccount(null, form({}))).toEqual({
        ...failure('conflict'),
        formError: ACCOUNT_CHANGED,
      });
    });
  });

  describe('deactivateAccount', () => {
    const base = {
      idempotencyKey: KEY,
      userId: USER,
      reason: 'Left the platform',
      username: 'achieng.odera',
    };

    it('deactivates once the username is typed back exactly', async () => {
      await actions.deactivateAccount(null, form({ ...base, confirmUsername: ' achieng.odera ' }));
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/platform/users/${USER}/deactivate`,
        { reason: 'Left the platform' },
        KEY,
      );
    });

    it("refuses a username that doesn't match, before any call", async () => {
      for (const confirmUsername of ['achieng', 'Achieng.Odera', '']) {
        const result = await actions.deactivateAccount(null, form({ ...base, confirmUsername }));
        expect(result).toMatchObject({
          ok: false,
          fieldErrors: { confirmUsername: CONFIRM_USERNAME_MISMATCH },
        });
      }
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('refuses a reason under 3 characters, before any call', async () => {
      const result = await actions.deactivateAccount(
        null,
        form({ ...base, reason: ' ab ', confirmUsername: 'achieng.odera' }),
      );
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Give a reason of at least 3 characters.' },
      });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('explains a 409 as a changed account, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.deactivateAccount(null, form({}))).toEqual({
        ...failure('conflict'),
        formError: ACCOUNT_CHANGED,
      });
    });
  });

  describe.each(ACTION_NAMES)('%s', (name) => {
    it.each(['../x', 'not-a-uuid', '', `${USER}/../suspend`])(
      'refuses the user id %j with no backend call',
      async (userId) => {
        const result = await actions[name](null, form({ ...VALID, userId }));
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
        expect(result.ok ? null : result.fieldErrors.userId).toEqual(expect.any(String));
        expect(apiPost).not.toHaveBeenCalled();
      },
    );

    it('refuses a missing or malformed idempotency key with no backend call', async () => {
      for (const idempotencyKey of ['', 'not-a-key']) {
        const result = await actions[name](null, form({ ...VALID, idempotencyKey }));
        expect(result.ok ? null : result.fieldErrors.idempotencyKey).toEqual(expect.any(String));
      }
      const { userId, reason, username, confirmUsername } = VALID;
      const absent = await actions[name](null, form({ userId, reason, username, confirmUsername }));
      expect(absent.ok ? null : absent.fieldErrors.idempotencyKey).toEqual(expect.any(String));
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('forwards the form-minted idempotency key, never a fresh one', async () => {
      await actions[name](null, form(VALID));
      await actions[name](null, form({ ...VALID, idempotencyKey: OTHER_KEY }));
      expect(apiPost.mock.calls.map(([path, , key]) => [path, key])).toEqual([
        [`/api/v1/platform/users/${USER}/${PATHS[name]}`, KEY],
        [`/api/v1/platform/users/${USER}/${PATHS[name]}`, OTHER_KEY],
      ]);
    });

    it('hands the submitted form, with its cross-tab guard field, to runServerAction', async () => {
      const submitted = form({ ...VALID, contextOrganisationId: ORGANISATION });
      await actions[name](null, submitted);
      expect(runServerAction).toHaveBeenCalledTimes(1);
      expect(runServerAction.mock.calls[0]?.[1]).toBe(submitted);
      expect(submitted.get('contextOrganisationId')).toBe(ORGANISATION);
    });

    describe('with the real runServerAction (the cross-tab guard)', () => {
      beforeEach(() => {
        runServerAction.mockImplementation(realRunServerAction);
        getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
      });

      it('refuses a submit after an organisation switch in another tab, before any call', async () => {
        const result = await actions[name](null, form({ ...VALID, contextOrganisationId: OTHER }));
        expect(result).toMatchObject({ ok: false, code: 'context_changed' });
        expect(apiPost).not.toHaveBeenCalled();
      });

      it('runs when the rendered organisation still matches, with the form key', async () => {
        const result = await actions[name](
          null,
          form({ ...VALID, contextOrganisationId: ORGANISATION }),
        );
        expect(result).toEqual({ ok: true });
        expect(apiPost).toHaveBeenCalledWith(
          `/api/v1/platform/users/${USER}/${PATHS[name]}`,
          expect.any(Object),
          KEY,
        );
      });
    });
  });

  describe('the guards (the real runServerAction)', () => {
    beforeEach(() => {
      runServerAction.mockImplementation(realRunServerAction);
      getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
      getCurrentContextProfile.mockResolvedValue(resolvedProfile(ORGANISATION));
    });

    it.each(['suspendAccount', 'deactivateAccount'] as const)(
      '%s refuses your own account before any call',
      async (name) => {
        const result = await actions[name](
          null,
          form({
            idempotencyKey: KEY,
            userId: SELF.toUpperCase(),
            reason: 'Testing myself',
            username: 'jane.manager',
            confirmUsername: 'jane.manager',
            contextOrganisationId: ORGANISATION,
          }),
        );
        expect(result).toMatchObject({ ok: false, code: OWN_ACCOUNT_CODE, formError: OWN_ACCOUNT });
        expect(apiPost).not.toHaveBeenCalled();
      },
    );

    it('refuses your own account whatever the letter case of the profile id', async () => {
      getCurrentContextProfile.mockResolvedValue({
        ...resolvedProfile(ORGANISATION),
        profile: { user_id: SELF.toUpperCase(), permissions: [] },
      });
      for (const name of ['suspendAccount', 'deactivateAccount'] as const) {
        const result = await actions[name](
          null,
          form({ ...VALID, userId: SELF, contextOrganisationId: ORGANISATION }),
        );
        expect(result).toMatchObject({ ok: false, code: OWN_ACCOUNT_CODE, formError: OWN_ACCOUNT });
      }
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('refuses when it cannot tell who you are, before any call', async () => {
      getCurrentContextProfile.mockResolvedValue({
        kind: 'redirect-to-context-selection',
        reason: 'invalid-context',
      });
      await expect(
        actions.suspendAccount(
          null,
          form({ idempotencyKey: KEY, userId: USER, reason: 'Fraud review' }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT:/select-context');
      expect(apiPost).not.toHaveBeenCalled();
    });

    it("does not refuse someone else's account", async () => {
      const result = await actions.suspendAccount(
        null,
        form({ idempotencyKey: KEY, userId: USER, reason: 'Fraud review' }),
      );
      expect(result).toEqual({ ok: true });
      expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it('refuses a submit after an organisation switch in another tab', async () => {
      const result = await actions.suspendAccount(
        null,
        form({
          idempotencyKey: KEY,
          userId: USER,
          reason: 'Fraud review',
          contextOrganisationId: OTHER,
        }),
      );
      expect(result).toMatchObject({ ok: false, code: 'context_changed' });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('rejects a malformed user id before any call', async () => {
      for (const userId of ['../x', 'not-a-uuid', '']) {
        const result = await actions.suspendAccount(
          null,
          form({ idempotencyKey: KEY, userId, reason: 'Fraud review' }),
        );
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      }
      expect(apiPost).not.toHaveBeenCalled();
    });
  });
});
