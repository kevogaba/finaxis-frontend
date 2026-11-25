import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type * as ActionResultModule from '@/lib/api/action-result';

const { apiPatch, apiPost, getAuthenticatedUser, getCurrentContextProfile, runServerAction } =
  vi.hoisted(() => ({
    apiPatch: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    getAuthenticatedUser: vi.fn(),
    getCurrentContextProfile: vi.fn(),
    runServerAction: vi.fn(),
  }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPatch: (path: string, body: Record<string, unknown>, key: string) => apiPatch(path, body, key),
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

const APPROVE_FORBIDDEN = "You can't approve this user. Your role doesn't allow it.";
const APPROVE_NOT_FOUND = 'This request no longer exists. Refresh the page.';
const APPROVE_CONFLICT =
  'This request was already decided, or the person has no active role or branch yet. Refresh and check.';
const REVOKE_CONFLICT = 'This membership was already revoked. Refresh and check.';
const RETRY_CONFLICT = "Provisioning can't be retried now. Refresh to see where it stands.";
const TYPE_NEEDS_BRANCH =
  'Staff and Admin members need an active branch assignment first. Assign a branch, then change the type.';
const EDIT_REFUSED =
  "These changes weren't accepted. The branch may no longer be active, or this membership can't be edited.";
const UNCHANGED = 'Change the type or the primary branch first.';
const WESTLANDS = '44444444-4444-4444-8444-444444444444';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';

const ACTION_NAMES = [
  'approveMembership',
  'suspendMembership',
  'reactivateMembership',
  'revokeMembership',
  'retryInvitation',
  'resendInvitation',
] as const;
const PATHS = {
  approveMembership: 'activate',
  suspendMembership: 'suspend',
  reactivateMembership: 'reactivate',
  revokeMembership: 'revoke',
  retryInvitation: 'invitation/retry',
  resendInvitation: 'invitation/resend',
} as const;

type Run = (input: unknown) => Promise<unknown>;

const fieldsOf = (data: FormData): Record<string, string> =>
  Object.fromEntries(
    [...data.entries()].map(([name, value]) => [name, typeof value === 'string' ? value : '']),
  );

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
    it('approves with an empty body on the activate path without a remark, forwarding the form key', async () => {
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

    // Decision Q7 (BG-01): an optional remark, sent only when it isn't blank.
    it('sends the trimmed remark when given, and {} when it is blank or absent', async () => {
      const path = `/api/v1/tenant/memberships/${MEMBERSHIP}/activate`;
      const base = { idempotencyKey: KEY, membershipId: MEMBERSHIP };

      await actions.approveMembership(null, form({ ...base, reason: '  Checked the form  ' }));
      expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'Checked the form' }, KEY);
      await actions.approveMembership(null, form({ ...base, reason: '   ' }));
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      await actions.approveMembership(null, form(base));
      expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);
      expect(apiPost).toHaveBeenCalledTimes(3);
    });

    it('accepts exactly 500 characters and refuses 501 as a field error, before any call', async () => {
      const base = { idempotencyKey: KEY, membershipId: MEMBERSHIP };
      expect(
        await actions.approveMembership(null, form({ ...base, reason: 'x'.repeat(501) })),
      ).toMatchObject({
        ok: false,
        fieldErrors: { reason: 'Keep the remark to 500 characters or fewer.' },
      });
      expect(apiPost).not.toHaveBeenCalled();

      await actions.approveMembership(null, form({ ...base, reason: 'x'.repeat(500) }));
      expect(apiPost).toHaveBeenCalledWith(expect.any(String), { reason: 'x'.repeat(500) }, KEY);
    });

    it('retries with the minted key and the same remark', async () => {
      const fields = { idempotencyKey: KEY, membershipId: MEMBERSHIP, reason: 'Form checked' };
      await actions.approveMembership(null, form(fields));
      await actions.approveMembership(null, form(fields));
      expect(apiPost.mock.calls.map(([, body, key]) => [body, key])).toEqual([
        [{ reason: 'Form checked' }, KEY],
        [{ reason: 'Form checked' }, KEY],
      ]);
    });

    it.each([
      // A missing permission only: the maker and the member have their own codes (BG-08).
      ['forbidden', APPROVE_FORBIDDEN],
      // BG-07: an unknown membership is a 404, one already decided or lacking access a 409.
      ['resource_not_found', APPROVE_NOT_FOUND],
      ['conflict', APPROVE_CONFLICT],
    ])('explains %s by its code, keeping the reference', async (code, formError) => {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.approveMembership(null, form({}))).toEqual({
        ...failure(code),
        formError,
      });
    });

    it('leaves other failure codes alone, the named maker-checker refusals included', async () => {
      for (const code of [
        'internal_error',
        'context_changed',
        'lifecycle.approver_is_membership_maker',
        'lifecycle.approver_is_membership_beneficiary',
      ]) {
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

    it('leaves failure codes alone, your own membership included (BG-35)', async () => {
      for (const code of ['conflict', 'lifecycle.self_membership_change']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.suspendMembership(null, form({}))).toEqual(failure(code));
      }
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

    it('explains a 409 as already revoked, keeping the reference (BG-07)', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.revokeMembership(null, form({}))).toEqual({
        ...failure('conflict'),
        formError: REVOKE_CONFLICT,
      });
    });

    it('leaves other failure codes alone, your own membership included (BG-35)', async () => {
      for (const code of ['internal_error', 'forbidden', 'lifecycle.self_membership_change']) {
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

  // BG-11 (platform #274): neither takes a body.
  describe('retryInvitation', () => {
    it('retries with an empty body on the invitation path, forwarding the form key', async () => {
      await actions.retryInvitation(null, form({ idempotencyKey: KEY, membershipId: MEMBERSHIP }));
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/invitation/retry`,
        {},
        KEY,
      );
    });

    // Review Focus 1: approved, revoked or provisioned elsewhere since the page loaded.
    it('explains a 409 as nothing left to retry, keeping the reference', async () => {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await actions.retryInvitation(null, form({}))).toEqual({
        ...failure('conflict'),
        formError: RETRY_CONFLICT,
      });
    });

    it('leaves other failure codes alone', async () => {
      for (const code of ['forbidden', 'resource_not_found', 'IDEMPOTENCY_KEY_REUSED']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.retryInvitation(null, form({}))).toEqual(failure(code));
      }
    });
  });

  describe('resendInvitation', () => {
    it('resends with an empty body on the invitation path, forwarding the form key', async () => {
      await actions.resendInvitation(null, form({ idempotencyKey: KEY, membershipId: MEMBERSHIP }));
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/tenant/memberships/${MEMBERSHIP}/invitation/resend`,
        {},
        KEY,
      );
    });

    // Its two 409s are named by their codes in describeProblem, never re-worded here.
    it('leaves its failures as describeProblem words them', async () => {
      for (const code of [
        'lifecycle.invitation_resend_too_soon',
        'lifecycle.invitation_resend_not_applicable',
        'forbidden',
      ]) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.resendInvitation(null, form({}))).toEqual(failure(code));
      }
    });
  });

  // BG-17 (platform #161): PATCH /tenant/memberships/{id}, sending only what changed.
  describe('updateMembership', () => {
    const PATH = `/api/v1/tenant/memberships/${MEMBERSHIP}`;
    /** The dialog as it opened on a Staff member at Westlands, then the person's choices. */
    const edit = (choices: { membershipType?: string; primaryBranchId?: string } = {}) =>
      form({
        idempotencyKey: KEY,
        membershipId: MEMBERSHIP,
        currentMembershipType: 'STAFF',
        currentPrimaryBranchId: WESTLANDS,
        membershipType: 'STAFF',
        primaryBranchId: WESTLANDS,
        ...choices,
      });

    it('sends only a changed type, on the membership path, with the form key', async () => {
      expect(await actions.updateMembership(null, edit({ membershipType: 'AUDITOR' }))).toEqual({
        ok: true,
      });
      expect(apiPatch).toHaveBeenCalledTimes(1);
      expect(apiPatch).toHaveBeenCalledWith(PATH, { membership_type: 'AUDITOR' }, KEY);
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('sends only a changed primary branch, and null for None', async () => {
      await actions.updateMembership(null, edit({ primaryBranchId: HEAD_OFFICE }));
      expect(apiPatch).toHaveBeenLastCalledWith(PATH, { primary_branch_id: HEAD_OFFICE }, KEY);
      await actions.updateMembership(null, edit({ primaryBranchId: '' }));
      expect(apiPatch).toHaveBeenLastCalledWith(PATH, { primary_branch_id: null }, KEY);
    });

    it('sends a branch chosen for a member who had none', async () => {
      const fields = {
        idempotencyKey: KEY,
        membershipId: MEMBERSHIP,
        currentMembershipType: 'AUDITOR',
        currentPrimaryBranchId: '',
        membershipType: 'AUDITOR',
        primaryBranchId: HEAD_OFFICE,
      };
      await actions.updateMembership(null, form(fields));
      expect(apiPatch).toHaveBeenCalledWith(PATH, { primary_branch_id: HEAD_OFFICE }, KEY);
    });

    it('sends both when both changed', async () => {
      await actions.updateMembership(
        null,
        edit({ membershipType: 'ADMIN', primaryBranchId: HEAD_OFFICE }),
      );
      expect(apiPatch).toHaveBeenCalledWith(
        PATH,
        { membership_type: 'ADMIN', primary_branch_id: HEAD_OFFICE },
        KEY,
      );
    });

    // Review Focus 2: a retry after a failure replays with the key the dialog minted.
    it('reuses the minted key on retry', async () => {
      const submitted = edit({ membershipType: 'ADMIN' });
      runServerAction.mockImplementationOnce(
        async (schema: z.ZodType, formData: FormData, run: Run) => {
          await run(schema.parse(Object.fromEntries(formData)));
          return failure('conflict');
        },
      );
      expect(await actions.updateMembership(null, submitted)).toMatchObject({
        ok: false,
        formError: TYPE_NEEDS_BRANCH,
      });
      expect(await actions.updateMembership(null, submitted)).toEqual({ ok: true });
      expect(apiPatch.mock.calls.map(([, body, key]) => [body, key])).toEqual([
        [{ membership_type: 'ADMIN' }, KEY],
        [{ membership_type: 'ADMIN' }, KEY],
      ]);
    });

    it.each([
      // An ACTIVE membership moving to Staff or Admin with no active branch assignment.
      ['conflict', TYPE_NEEDS_BRANCH],
      // A branch no longer ACTIVE, or a membership revoked meanwhile.
      ['invalid_operation', EDIT_REFUSED],
    ])('explains %s by its code, keeping the reference', async (code, formError) => {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.updateMembership(null, edit())).toEqual({
        ...failure(code),
        formError,
      });
    });

    it('leaves other failure codes alone', async () => {
      for (const code of ['forbidden', 'resource_not_found', 'context_changed']) {
        runServerAction.mockResolvedValueOnce(failure(code));
        expect(await actions.updateMembership(null, edit())).toEqual(failure(code));
      }
    });

    it.each([
      ['a system type', { membershipType: 'SYSTEM' }, 'membershipType'],
      ['an unknown type', { membershipType: 'GUEST' }, 'membershipType'],
      ['a malformed branch', { primaryBranchId: 'not-a-uuid' }, 'primaryBranchId'],
      ['a malformed membership id', { membershipId: '../x' }, 'membershipId'],
    ])('refuses %s with no backend call', async (_case, fields, field) => {
      const result = await actions.updateMembership(null, form({ ...fieldsOf(edit()), ...fields }));
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
      expect(result.ok ? null : result.fieldErrors[field]).toEqual(expect.any(String));
      expect(apiPatch).not.toHaveBeenCalled();
    });

    describe('with the real runServerAction', () => {
      beforeEach(() => {
        runServerAction.mockImplementation(realRunServerAction);
        getAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
      });

      // An empty body is a 422: saved as it opened, nothing is sent.
      it('sends nothing when nothing changed, and says what to change', async () => {
        expect(await actions.updateMembership(null, edit())).toEqual({
          ok: false,
          formError: UNCHANGED,
          fieldErrors: {},
          code: 'membership_unchanged',
          requestId: null,
        });
        expect(apiPatch).not.toHaveBeenCalled();
      });

      it('refuses a submit after an organisation switch, before any backend call (I2)', async () => {
        getCurrentContextProfile.mockResolvedValueOnce({
          kind: 'resolved',
          context: { organization: { id: OTHER_ORGANISATION } },
        });
        const submitted = edit({ membershipType: 'ADMIN' });
        submitted.set('contextOrganisationId', ORGANISATION);
        expect(await actions.updateMembership(null, submitted)).toMatchObject({
          ok: false,
          code: 'context_changed',
        });
        expect(apiPatch).not.toHaveBeenCalled();
      });
    });
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
