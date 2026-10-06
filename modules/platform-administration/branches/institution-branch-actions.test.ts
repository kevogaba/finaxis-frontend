import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type * as ActionResultModule from '@/lib/api/action-result';
import {
  BRANCH_CODE_MAY_BE_TAKEN,
  BRANCH_CREATE_CONFLICT,
  BRANCH_CREATE_REFUSED,
} from './institution-branch-rules';

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
// The real unstable_rethrow keeps a redirect propagating; this stand-in does the same for the
// redirect the mock below throws, so the real runServerAction lets the draft's redirect through.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT:')) throw error;
  },
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile() as unknown,
}));
// The reserved platform organisation (BG-29): the draft's `tenantId` refinement reads it, and zod
// lets a throwing refinement escape safeParse. A literal, because vi.mock is hoisted above the
// constants; the same id as ORGANISATION below.
vi.mock('@/config/env.server', () => ({
  serverEnv: { PLATFORM_ORGANISATION_ID: '00000000-0000-0000-0000-000000000000' },
}));

const actions = await import('./institution-branch-actions');
const realRunServerAction = (
  await vi.importActual<typeof ActionResultModule>('@/lib/api/action-result')
).runServerAction;

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_KEY = '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const TENANT = '99999999-9999-4999-8999-999999999999';
// Lettered, so its upper case differs from it (the brief's TENANT has no letters to change).
const LETTERED = '17000000-0000-4000-8000-0000000000ab';
const BRANCH = '17000000-0000-4000-8000-0000000000b7';
const ORGANISATION = '00000000-0000-0000-0000-000000000000';
const OTHER = '11111111-1111-4111-8111-111111111111';
const FIELDS = {
  idempotencyKey: KEY,
  tenantId: TENANT,
  branchCode: ' THIKA ',
  branchName: 'Thika Road Branch',
  branchType: 'OPERATIONS',
  parentBranchId: '',
  timezone: 'Africa/Nairobi',
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

describe('institution branch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A validating pass-through (a schema failure returns a result, like the real one); the draft
    // action reads no profile, so none is needed. runServerAction has its own test.
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
    apiPost.mockResolvedValue({ branch_id: BRANCH.toUpperCase(), status: 'DRAFT' });
  });

  it('posts the draft field by field to the institution, with the form key, and opens it', async () => {
    await expect(actions.createInstitutionBranchDraft(null, form(FIELDS))).rejects.toThrow(
      `NEXT_REDIRECT:/platform-admin/tenants/${TENANT}/branches/${BRANCH}`,
    );
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(
      `/api/v1/platform/tenants/${TENANT}/branches`,
      {
        branch_code: 'THIKA',
        branch_name: 'Thika Road Branch',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
      KEY,
    );
    // No `address`: it is stored but never returned (BG-13). Only the five fields are sent.
    expect(Object.keys(apiPost.mock.calls[0]?.[1] ?? {})).toEqual([
      'branch_code',
      'branch_name',
      'branch_type',
      'parent_branch_id',
      'timezone',
    ]);
  });

  it('posts to the institution by its lower-cased id (contract §A: ids are case-insensitive)', async () => {
    await expect(
      actions.createInstitutionBranchDraft(
        null,
        form({ ...FIELDS, tenantId: LETTERED.toUpperCase() }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${LETTERED}/branches/${BRANCH}`);
    expect(apiPost.mock.calls[0]?.[0]).toBe(`/api/v1/platform/tenants/${LETTERED}/branches`);
  });

  it('refuses the platform organisation and a malformed institution id before any call', async () => {
    for (const tenantId of [ORGANISATION, ORGANISATION.toUpperCase(), '../x', 'not-a-uuid', '']) {
      const result = await actions.createInstitutionBranchDraft(
        null,
        form({ ...FIELDS, tenantId }),
      );
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { tenantId: 'Choose an institution.' },
      });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('refuses a malformed key, code, timezone or parent before any call', async () => {
    const bad: Record<string, string>[] = [
      { idempotencyKey: 'not-a-key' },
      { branchCode: 'a b' },
      { branchName: 'x' },
      { timezone: 'Mars/Olympus' },
      { parentBranchId: '../x' },
    ];
    for (const change of bad) {
      const result = await actions.createInstitutionBranchDraft(
        null,
        form({ ...FIELDS, ...change }),
      );
      expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('explains the BG-18 refusal', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.createInstitutionBranchDraft(null, form({}))).toEqual({
      ...failure('forbidden'),
      formError: BRANCH_CREATE_REFUSED,
    });
  });

  it('explains a 409 with the code field', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.createInstitutionBranchDraft(null, form({}))).toEqual({
      ...failure('conflict'),
      formError: BRANCH_CREATE_CONFLICT,
      fieldErrors: { branchCode: BRANCH_CODE_MAY_BE_TAKEN },
    });
  });

  it('leaves other failure codes alone', async () => {
    for (const code of ['internal_error', 'context_changed']) {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.createInstitutionBranchDraft(null, form({}))).toEqual(failure(code));
    }
  });

  it('forwards the form-minted idempotency key, never a fresh one', async () => {
    for (const idempotencyKey of [KEY, OTHER_KEY]) {
      await expect(
        actions.createInstitutionBranchDraft(null, form({ ...FIELDS, idempotencyKey })),
      ).rejects.toThrow('NEXT_REDIRECT');
    }
    expect(apiPost.mock.calls.map(([, , key]) => key)).toEqual([KEY, OTHER_KEY]);
  });

  it('hands the submitted form, with its cross-tab guard field, to runServerAction', async () => {
    const submitted = form({ ...FIELDS, contextOrganisationId: ORGANISATION });
    await expect(actions.createInstitutionBranchDraft(null, submitted)).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(runServerAction).toHaveBeenCalledTimes(1);
    expect(runServerAction.mock.calls[0]?.[1]).toBe(submitted);
    expect(submitted.get('contextOrganisationId')).toBe(ORGANISATION);
  });

  describe('with the real runServerAction (the cross-tab guard)', () => {
    beforeEach(() => {
      runServerAction.mockImplementation(realRunServerAction);
      getAuthenticatedUser.mockResolvedValue({ id: 'session-user' });
      getCurrentContextProfile.mockResolvedValue({
        kind: 'resolved',
        profile: { user_id: 'someone', permissions: [] },
        context: { organization: { id: ORGANISATION, name: 'Platform' } },
      });
    });

    it('refuses a submit after an organisation switch', async () => {
      const result = await actions.createInstitutionBranchDraft(
        null,
        form({ ...FIELDS, contextOrganisationId: OTHER }),
      );
      expect(result).toMatchObject({ ok: false, code: 'context_changed' });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('runs when the rendered organisation still matches, with the form key', async () => {
      await expect(
        actions.createInstitutionBranchDraft(
          null,
          form({ ...FIELDS, contextOrganisationId: ORGANISATION }),
        ),
      ).rejects.toThrow(`NEXT_REDIRECT:/platform-admin/tenants/${TENANT}/branches/${BRANCH}`);
      expect(apiPost).toHaveBeenCalledWith(
        `/api/v1/platform/tenants/${TENANT}/branches`,
        expect.any(Object),
        KEY,
      );
    });
  });
});
