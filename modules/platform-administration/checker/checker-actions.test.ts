import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { ACTIVATE_FORBIDDEN } from '@/modules/administration/branches/branch-rules';
import { APPROVE_FORBIDDEN, APPROVE_NOT_FOUND } from '@/modules/administration/users/user-rules';
import {
  CHECKER_ACTIVATE_CONFLICT,
  CHECKER_APPROVE_CONFLICT,
  CHECKER_RETURN_CONFLICT,
  CHECKER_SUBMIT_CONFLICT,
} from './checker-rules';

const { apiPost, runServerAction } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  runServerAction: vi.fn(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));
// The `tenantId` refinement reads the reserved platform organisation (BG-29). A literal, because
// vi.mock is hoisted above the constants.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));

const actions = await import('./checker-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_KEY = '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
// Lettered, so their upper-case forms differ from them.
const TENANT = '15000000-0000-4000-8000-0000000000f1';
const MEMBERSHIP = '15000000-0000-4000-8000-0000000000b2';
const BRANCH = '15000000-0000-4000-8000-0000000000c3';
const PLATFORM = '00000000-0000-0000-0000-000000000000';

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

const MEMBER = { idempotencyKey: KEY, tenantId: TENANT, membershipId: MEMBERSHIP };
const BRANCH_FIELDS = { idempotencyKey: KEY, tenantId: TENANT, branchId: BRANCH };

beforeEach(() => {
  vi.clearAllMocks();
  // A validating pass-through (a schema failure returns a result, like the real one).
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

describe('approveAsPlatformChecker (BG-02)', () => {
  it('posts to the platform checker route by lower-cased ids, with the form key and no remark', async () => {
    apiPost.mockResolvedValueOnce({ membership_status: 'ACTIVE', user_status: 'ACTIVE' });

    const result = await actions.approveAsPlatformChecker(
      null,
      form({
        ...MEMBER,
        tenantId: TENANT.toUpperCase(),
        membershipId: MEMBERSHIP.toUpperCase(),
        reason: '  ',
      }),
    );

    expect(result).toEqual({ ok: true, outcome: 'active' });
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}/memberships/${MEMBERSHIP}/activate`,
      {},
      KEY,
    );
  });

  it('sends a remark only when it is not blank, trimmed (decision Q7)', async () => {
    await actions.approveAsPlatformChecker(null, form({ ...MEMBER, reason: ' First teller ' }));
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ reason: 'First teller' });
  });

  it("reads a 202's echo as provisioning, and an unreadable echo as recorded", async () => {
    apiPost.mockResolvedValueOnce({
      membership_status: 'PENDING_APPROVAL',
      user_status: 'PROVISIONING_IDP',
    });
    expect(await actions.approveAsPlatformChecker(null, form(MEMBER))).toEqual({
      ok: true,
      outcome: 'provisioning',
    });
    apiPost.mockResolvedValueOnce({});
    expect(await actions.approveAsPlatformChecker(null, form(MEMBER))).toEqual({
      ok: true,
      outcome: 'recorded',
    });
  });

  it('accepts exactly 500 characters and refuses 501 as a remark field error, before any call', async () => {
    const refused = await actions.approveAsPlatformChecker(
      null,
      form({ ...MEMBER, reason: 'x'.repeat(501) }),
    );
    expect(refused).toMatchObject({
      ok: false,
      fieldErrors: { reason: 'Keep the remark to 500 characters or fewer.' },
    });
    expect(apiPost).not.toHaveBeenCalled();

    await actions.approveAsPlatformChecker(null, form({ ...MEMBER, reason: 'x'.repeat(500) }));
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ reason: 'x'.repeat(500) });
  });

  it('refuses the platform organisation, a malformed id and a long remark before any call', async () => {
    const bad: Record<string, string>[] = [
      { tenantId: PLATFORM },
      { tenantId: 'not-a-uuid' },
      { membershipId: '../x' },
      { idempotencyKey: 'not-a-key' },
      { reason: 'x'.repeat(501) },
    ];
    for (const change of bad) {
      expect(
        await actions.approveAsPlatformChecker(null, form({ ...MEMBER, ...change })),
      ).toMatchObject({ ok: false, code: 'validation_failed' });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    ['forbidden', APPROVE_FORBIDDEN],
    ['resource_not_found', APPROVE_NOT_FOUND],
    ['conflict', CHECKER_APPROVE_CONFLICT],
  ])('explains a %s', async (code, formError) => {
    runServerAction.mockResolvedValueOnce(failure(code));
    expect(await actions.approveAsPlatformChecker(null, form(MEMBER))).toEqual({
      ...failure(code),
      formError,
    });
  });

  it('leaves the named refusals to describeProblem', async () => {
    for (const code of [
      'lifecycle.platform_checker_closed',
      'lifecycle.approver_is_membership_maker',
      'lifecycle.approver_is_membership_beneficiary',
    ]) {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.approveAsPlatformChecker(null, form(MEMBER))).toEqual(failure(code));
    }
  });

  it('reuses the minted key on retry, and forwards whichever key the form minted', async () => {
    apiPost.mockRejectedValueOnce(new Error('network'));
    runServerAction.mockImplementationOnce(async (schema: z.ZodType, data: FormData, run: Run) => {
      await run(schema.parse(Object.fromEntries(data))).catch(() => undefined);
      return failure('network_error');
    });
    await actions.approveAsPlatformChecker(null, form(MEMBER));
    await actions.approveAsPlatformChecker(null, form(MEMBER));
    await actions.approveAsPlatformChecker(null, form({ ...MEMBER, idempotencyKey: OTHER_KEY }));
    expect(apiPost.mock.calls.map(([, , key]) => key)).toEqual([KEY, KEY, OTHER_KEY]);
  });
});

describe('the branch checker actions (BG-02)', () => {
  it.each([
    ['submit', actions.submitInstitutionBranch],
    ['activate', actions.activateInstitutionBranch],
  ] as const)('%s posts to its platform route, the remark only when given', async (path, run) => {
    await run(
      null,
      form({ ...BRANCH_FIELDS, tenantId: TENANT.toUpperCase(), branchId: BRANCH.toUpperCase() }),
    );
    await run(null, form({ ...BRANCH_FIELDS, reason: ' Ready ' }));
    expect(apiPost.mock.calls).toEqual([
      [`/api/v1/platform/tenants/${TENANT}/branches/${BRANCH}/${path}`, {}, KEY],
      [`/api/v1/platform/tenants/${TENANT}/branches/${BRANCH}/${path}`, { reason: 'Ready' }, KEY],
    ]);
  });

  it('returns (or withdraws) with a required reason of 3 to 500 characters', async () => {
    for (const reason of ['', 'ab', 'x'.repeat(501)]) {
      expect(
        await actions.returnInstitutionBranch(null, form({ ...BRANCH_FIELDS, reason })),
      ).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) as string } });
    }
    expect(apiPost).not.toHaveBeenCalled();

    await actions.returnInstitutionBranch(
      null,
      form({ ...BRANCH_FIELDS, reason: ' Fix the code ' }),
    );
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}/branches/${BRANCH}/return`,
      { reason: 'Fix the code' },
      KEY,
    );
  });

  it('refuses the platform organisation before any call', async () => {
    for (const run of [
      actions.submitInstitutionBranch,
      actions.activateInstitutionBranch,
      actions.returnInstitutionBranch,
    ]) {
      expect(
        await run(null, form({ ...BRANCH_FIELDS, tenantId: PLATFORM, reason: 'A reason' })),
      ).toMatchObject({ ok: false, fieldErrors: { tenantId: 'Choose an institution.' } });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    [actions.submitInstitutionBranch, 'conflict', CHECKER_SUBMIT_CONFLICT],
    [actions.activateInstitutionBranch, 'conflict', CHECKER_ACTIVATE_CONFLICT],
    [actions.activateInstitutionBranch, 'forbidden', ACTIVATE_FORBIDDEN],
    [actions.returnInstitutionBranch, 'conflict', CHECKER_RETURN_CONFLICT],
  ])('explains its plain refusals (%#)', async (run, code, formError) => {
    runServerAction.mockResolvedValueOnce(failure(code));
    expect(await run(null, form(BRANCH_FIELDS))).toEqual({ ...failure(code), formError });
  });

  it('leaves the window and the maker refusals to describeProblem', async () => {
    for (const code of [
      'lifecycle.platform_checker_closed',
      'lifecycle.approver_is_branch_maker',
      'lifecycle.approver_is_branch_modifier',
    ]) {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.activateInstitutionBranch(null, form(BRANCH_FIELDS))).toEqual(
        failure(code),
      );
    }
  });

  it('reuses the minted key on retry', async () => {
    await actions.returnInstitutionBranch(null, form({ ...BRANCH_FIELDS, reason: 'Fix it' }));
    await actions.returnInstitutionBranch(null, form({ ...BRANCH_FIELDS, reason: 'Fix it' }));
    expect(apiPost.mock.calls.map(([, , key]) => key)).toEqual([KEY, KEY]);
  });
});
