import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import {
  EMAIL_TAKEN,
  INVITE_CONFLICT,
  INVITE_MAY_BE_SENT,
  INVITE_REFUSED,
  INVITE_REJECTED,
  INVITE_STALE_ACCESS,
  NEEDS_A_ROLE,
  REINVITE_CONFLICT,
  ROLE_BRANCH_UNASSIGNED,
  USERNAME_IN_USE,
  USERNAME_TAKEN,
} from './invite-rules';

const { apiPost, findMemberByEmail, findMemberByUsername, redirect, refresh, runServerAction } =
  vi.hoisted(() => ({
    apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
      Promise.resolve<unknown>({}),
    ),
    findMemberByEmail: vi.fn((_email: string) => Promise.resolve<unknown>(null)),
    findMemberByUsername: vi.fn((_username: string) => Promise.resolve<unknown>(null)),
    redirect: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT:${to}`);
    }),
    refresh: vi.fn(),
    runServerAction: vi.fn(),
  }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('next/cache', () => ({
  refresh: () => {
    refresh();
  },
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
vi.mock('./invite-service', () => ({
  findMemberByEmail: (email: string) => findMemberByEmail(email),
  findMemberByUsername: (username: string) => findMemberByUsername(username),
}));
vi.mock('@/config/env.server', () => ({ serverEnv: {} }));

const { inviteUser } = await import('./invite-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ORG = '11111111-1111-4111-8111-111111111111';
// Distinct first blocks, so a field error names its row.
const WESTLANDS = 'a4000000-0000-4000-8000-0000000000aa';
const HEAD_OFFICE = 'b2000000-0000-4000-8000-0000000000bb';
const TELLER = 'c1000000-0000-4000-8000-0000000000cc';
const NEW_USER = '11000000-0000-4000-8000-0000000000e1';
const ESTHER = 'e5000000-0000-4000-8000-0000000000ee';

const FIELDS = {
  displayName: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
  phone: '',
  membershipType: 'STAFF',
  primaryBranchId: WESTLANDS,
  branchAssignments: JSON.stringify([{ branchId: WESTLANDS, assignmentType: 'HOME' }]),
  roleAssignments: JSON.stringify([{ roleId: TELLER, scopeType: 'TENANT', branchId: '' }]),
  sendIdentityInvite: 'true',
  sendApplicationInvite: 'false',
  idempotencyKey: KEY,
  contextOrganisationId: ORG,
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

const invite = (fields: Record<string, string> = FIELDS) => inviteUser(null, form(fields));
// BG-07: a taken email or username, or an institution that isn't active, is a 409 `conflict`.
const conflict = () => new BackendApiError(409, { code: 'conflict', requestId: 'req-7' });

describe('inviteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirrors runServerAction's contract (lib/api/action-result.ts): its own zod failures become
    // fieldErrors keyed by the issue path, a thrown BackendApiError a failure carrying its code, and
    // a redirect keeps propagating. runServerAction has its own test (the cross-tab guard included).
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        const parsed = schema.safeParse(Object.fromEntries(formData));
        if (!parsed.success) {
          return {
            ok: false,
            formError: 'Check the highlighted fields and try again.',
            fieldErrors: Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
            code: 'validation_failed',
            requestId: null,
          };
        }
        try {
          await run(parsed.data);
        } catch (error) {
          if (!(error instanceof BackendApiError)) throw error;
          return {
            ok: false,
            formError: 'generic',
            fieldErrors: {},
            code: error.code,
            requestId: error.requestId,
          };
        }
        return { ok: true };
      },
    );
  });

  it('posts the explicit snake_case body with the minted key, then opens the new record', async () => {
    apiPost.mockResolvedValueOnce({
      user_id: NEW_USER,
      membership_id: '11000000-0000-4000-8000-0000000000e2',
      user_status: 'DRAFT',
      membership_status: 'PENDING_APPROVAL',
    });

    await expect(invite()).rejects.toThrow(`NEXT_REDIRECT:/admin/users/${NEW_USER}`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/users',
      {
        email: 'neema.wanjiku@greenfield.example',
        username: 'neema.wanjiku',
        display_name: 'Neema Wanjiku',
        phone_e164: null,
        membership_type: 'STAFF',
        primary_branch_id: WESTLANDS,
        branch_assignments: [{ branch_id: WESTLANDS, assignment_type: 'HOME' }],
        role_assignments: [{ role_id: TELLER, scope_type: 'TENANT', branch_id: null }],
        send_keycloak_invite: true,
        send_application_invite: false,
      },
      KEY,
    );
    // The cross-tab guard (07's I2) is runServerAction's: the field reaches it untouched.
    expect((runServerAction.mock.calls[0]?.[1] as FormData).get('contextOrganisationId')).toBe(ORG);
    // A success never reads the directory: nothing could stand in a replay's way (Ruling 1).
    expect(findMemberByEmail).not.toHaveBeenCalled();
    expect(findMemberByUsername).not.toHaveBeenCalled();
    // Refreshed before the redirect, so the shell's bell and the back/forward cache drop the count
    // from before the invitation.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('lands on the directory when the created invitation echoes no readable id', async () => {
    apiPost.mockResolvedValueOnce({ membership_status: 'PENDING_APPROVAL' });
    await expect(invite()).rejects.toThrow('NEXT_REDIRECT:/admin/users');
    expect(redirect).toHaveBeenCalledWith('/admin/users');
  });

  it('refuses a broken rule before any call, naming the field by its row', async () => {
    const result = await invite({
      ...FIELDS,
      roleAssignments: JSON.stringify([
        { roleId: TELLER, scopeType: 'BRANCH', branchId: HEAD_OFFICE },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { 'roleAssignments.0.branchId': ROLE_BRANCH_UNASSIGNED },
    });
    expect(await invite({ ...FIELDS, roleAssignments: '[]' })).toMatchObject({
      ok: false,
      fieldErrors: { roleAssignments: NEEDS_A_ROLE },
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('refuses a malformed key before any call', async () => {
    expect((await invite({ ...FIELDS, idempotencyKey: 'not-a-key' })).ok).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    ['ACTIVE', 'This email already belongs to a member of this institution.'],
    [
      'SUSPENDED',
      'This email belongs to a suspended member of this institution. Reactivate them from their record instead.',
    ],
  ])(
    'names a %s member on the email after the invite’s 409 (BG-07), and only then',
    async (status, message) => {
      apiPost.mockRejectedValueOnce(conflict());
      findMemberByEmail.mockResolvedValueOnce({ membershipStatus: status });

      expect(await invite()).toEqual({
        ok: false,
        formError: EMAIL_TAKEN,
        fieldErrors: { email: message },
        code: 'email_taken',
        // The failed post's reference, for support.
        requestId: 'req-7',
      });
      expect(findMemberByEmail).toHaveBeenCalledWith('neema.wanjiku@greenfield.example');
      expect(apiPost.mock.invocationCallOrder[0]).toBeLessThan(
        findMemberByEmail.mock.invocationCallOrder[0] ?? 0,
      );
      // A taken email explains the failure: no username lookup.
      expect(findMemberByUsername).not.toHaveBeenCalled();
    },
  );

  it("names neither the email nor the username of a revoked member's 409: the platform re-invites them (BG-28)", async () => {
    apiPost.mockRejectedValueOnce(conflict());
    findMemberByEmail.mockResolvedValueOnce({ membershipStatus: 'REVOKED' });

    // The account is matched by email, so its username was never checked: the 409 is another
    // cause (an institution that isn't active, a change meanwhile), and the copy never asks to check
    // the username.
    expect(await invite()).toMatchObject({
      ok: false,
      formError: REINVITE_CONFLICT,
      fieldErrors: {},
      code: 'conflict',
      requestId: 'req-7',
    });
    expect(REINVITE_CONFLICT).not.toMatch(/username/i);
    expect(findMemberByUsername).not.toHaveBeenCalled();
  });

  it('names a username a member here holds once the email is free, with the reference (Ruling 15)', async () => {
    apiPost.mockRejectedValueOnce(conflict());
    findMemberByUsername.mockResolvedValueOnce({ id: ESTHER, username: 'Neema.Wanjiku' });

    expect(await invite()).toEqual({
      ok: false,
      formError: USERNAME_TAKEN,
      fieldErrors: { username: USERNAME_IN_USE },
      code: 'username_taken',
      requestId: 'req-7',
    });
    expect(findMemberByUsername).toHaveBeenCalledWith('neema.wanjiku');
    expect(findMemberByEmail.mock.invocationCallOrder[0]).toBeLessThan(
      findMemberByUsername.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('names the causes it can’t check, with the reference, when no member has the email or username', async () => {
    apiPost.mockRejectedValueOnce(conflict());
    expect(await invite()).toMatchObject({
      ok: false,
      formError: INVITE_CONFLICT,
      fieldErrors: {},
      code: 'conflict',
      requestId: 'req-7',
    });
    expect(findMemberByUsername).toHaveBeenCalledWith('neema.wanjiku');
  });

  it('keeps the original failure when the lookups themselves fail', async () => {
    apiPost.mockRejectedValueOnce(conflict());
    findMemberByEmail.mockRejectedValueOnce(new BackendApiError(503));
    findMemberByUsername.mockRejectedValueOnce(new BackendApiError(503));
    expect(await invite()).toMatchObject({
      formError: INVITE_CONFLICT,
      code: 'conflict',
      requestId: 'req-7',
    });
  });

  it.each([
    ['a 502', new BackendApiError(502, { requestId: 'req-8' })],
    // No invite rule is a 500 any more (BG-07): a 500 is a fault, explained generically.
    ['a 500', new BackendApiError(500, { code: 'internal_error', requestId: 'req-8' })],
    [
      'a reused key',
      new BackendApiError(409, { code: 'IDEMPOTENCY_KEY_REUSED', requestId: 'req-8' }),
    ],
  ])('looks nothing up after %s, which is no conflict', async (_case, error) => {
    apiPost.mockRejectedValueOnce(error);
    expect(await invite()).toMatchObject({ ok: false, requestId: 'req-8' });
    expect(findMemberByEmail).not.toHaveBeenCalled();
    expect(findMemberByUsername).not.toHaveBeenCalled();
  });

  it('keeps the generic message for a 500, never the retired rule copy', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(500, { code: 'internal_error', requestId: 'req-8' }),
    );
    expect(await invite()).toMatchObject({ formError: 'generic', code: 'internal_error' });
  });

  it('says a picked role or branch went stale on a 422 (BG-07), looking nothing up', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(422, { code: 'invalid_operation', requestId: 'req-6' }),
    );
    expect(await invite()).toEqual({
      ok: false,
      formError: INVITE_STALE_ACCESS,
      fieldErrors: {},
      code: 'invalid_operation',
      requestId: 'req-6',
    });
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('names the platform’s own 400 apart from a field this form flagged (BG-07)', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(400, { code: 'validation_failed', requestId: 'req-4' }),
    );
    expect(await invite()).toMatchObject({
      ok: false,
      formError: INVITE_REJECTED,
      fieldErrors: {},
      requestId: 'req-4',
    });
    expect(findMemberByEmail).not.toHaveBeenCalled();
    // The form's own refusal keeps its fields and its words.
    expect(await invite({ ...FIELDS, roleAssignments: '[]' })).toMatchObject({
      formError: 'Check the highlighted fields and try again.',
      fieldErrors: { roleAssignments: NEEDS_A_ROLE },
    });
  });

  it('explains a 403: the role, or one of the branches (contract §E.3)', async () => {
    apiPost.mockRejectedValueOnce(new BackendApiError(403, { code: 'forbidden' }));
    expect(await invite()).toMatchObject({ formError: INVITE_REFUSED, code: 'forbidden' });
  });

  it('says an earlier send may have landed when its key already sent other answers (Ruling 16)', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(409, { code: 'IDEMPOTENCY_KEY_REUSED', requestId: 'req-9' }),
    );
    expect(await invite()).toMatchObject({
      formError: INVITE_MAY_BE_SENT,
      code: 'IDEMPOTENCY_KEY_REUSED',
      requestId: 'req-9',
    });
    expect(findMemberByEmail).not.toHaveBeenCalled();
  });

  it('leaves any other code with its own message', async () => {
    apiPost.mockRejectedValueOnce(
      new BackendApiError(409, { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }),
    );
    expect(await invite()).toMatchObject({
      formError: 'generic',
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    });
  });
});
