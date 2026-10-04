import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const { apiDelete, apiPost, redirect, runServerAction } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiDelete: vi.fn((_path: string, _key: string) => Promise.resolve<unknown>({})),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  runServerAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) as unknown }));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
  apiDelete: (path: string, key: string) => apiDelete(path, key),
}));
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: (...args: unknown[]) => runServerAction(...args) as unknown,
}));

const actions = await import('./branch-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const USER = '08000000-0000-4000-8000-000000000002';
const ASSIGNMENT = '08000000-0000-4000-8000-000000000009';

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

describe('branch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pass-through: this file covers fields, bodies, and messages; runServerAction has its own test.
    runServerAction.mockImplementation(
      async (schema: z.ZodType, formData: FormData, run: (input: unknown) => Promise<unknown>) => {
        await run(schema.parse(Object.fromEntries(formData)));
        return { ok: true };
      },
    );
  });

  it('creates a draft with an explicit snake_case body and redirects to the record', async () => {
    apiPost.mockResolvedValueOnce({ branch_id: BRANCH, status: 'DRAFT' });

    await expect(
      actions.createBranchDraft(
        null,
        form({
          idempotencyKey: KEY,
          branchCode: 'NAIROBI_CBD',
          branchName: ' Nairobi CBD Branch ',
          branchType: 'OPERATIONS',
          parentBranchId: '',
          timezone: 'Africa/Nairobi',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/branches/${BRANCH}`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/branches',
      {
        branch_code: 'NAIROBI_CBD',
        branch_name: 'Nairobi CBD Branch',
        branch_type: 'OPERATIONS',
        parent_branch_id: null,
        timezone: 'Africa/Nairobi',
      },
      KEY,
    );
  });

  it("points a create 409 at the code without claiming it's a duplicate", async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    const result = await actions.createBranchDraft(null, form({}));
    expect(result).toMatchObject({
      ok: false,
      code: 'conflict',
      requestId: 'req-1',
      fieldErrors: { branchCode: 'This code may already be in use.' },
      formError: expect.stringContaining('may already be in use') as unknown,
    });
  });

  it.each([
    ['submitBranch', 'submit'],
    ['activateBranch', 'activate'],
    ['reactivateBranch', 'reactivate'],
  ] as const)('%s posts {} or {reason} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: '  ' }));
    expect(apiPost).toHaveBeenLastCalledWith(`/api/v1/branches/${BRANCH}/${path}`, {}, KEY);

    await actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: ' Ready ' }));
    expect(apiPost).toHaveBeenLastCalledWith(
      `/api/v1/branches/${BRANCH}/${path}`,
      { reason: 'Ready' },
      KEY,
    );
  });

  it.each(['suspendBranch', 'closeBranch'] as const)(
    '%s requires a reason of 3–500 characters before calling the backend',
    async (name) => {
      await expect(
        actions[name](null, form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'ab' })),
      ).rejects.toThrow();
      await expect(
        actions[name](
          null,
          form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'x'.repeat(501) }),
        ),
      ).rejects.toThrow();
      expect(apiPost).not.toHaveBeenCalled();

      await actions[name](
        null,
        form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'Cash count' }),
      );
      expect(apiPost).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/branches/${BRANCH}/(suspend|close)$`)),
        { reason: 'Cash count' },
        KEY,
      );
    },
  );

  it('explains an activation 403 as permission or maker-checker (BG-08) and leaves others alone', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.activateBranch(null, form({}))).toMatchObject({
      code: 'forbidden',
      formError: expect.stringContaining('you drafted it') as unknown,
    });

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.activateBranch(null, form({}))).toMatchObject({ formError: 'generic' });
  });

  it('explains a blocked close', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.closeBranch(null, form({}))).toMatchObject({
      formError: expect.stringContaining("can't be closed while users are assigned") as unknown,
    });
  });

  it('assigns with a snake_case body and refuses a missing user before calling the backend', async () => {
    await actions.assignBranchUser(
      null,
      form({ idempotencyKey: KEY, branchId: BRANCH, userId: USER, assignmentType: 'APPROVE' }),
    );
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/branch-assignments',
      { user_id: USER, branch_id: BRANCH, assignment_type: 'APPROVE' },
      KEY,
    );

    apiPost.mockClear();
    await expect(
      actions.assignBranchUser(
        null,
        form({ idempotencyKey: KEY, branchId: BRANCH, userId: '', assignmentType: 'APPROVE' }),
      ),
    ).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("names a missing branch, for the user record's visible branch select", async () => {
    const schemas: z.ZodType[] = [];
    runServerAction.mockImplementationOnce((given: z.ZodType) => {
      schemas.push(given);
      return Promise.resolve({ ok: true });
    });
    await actions.assignBranchUser(null, form({}));
    const fields = { idempotencyKey: KEY, userId: USER, assignmentType: 'OPERATE' };

    for (const branchId of ['', 'not-a-uuid']) {
      const parsed = schemas[0]?.safeParse({ ...fields, branchId });
      expect(parsed?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ['branchId'], message: 'Choose a branch.' }),
      );
    }
    // A chosen branch raises no branchId issue, and the same input is otherwise valid.
    expect(schemas[0]?.safeParse({ ...fields, branchId: BRANCH }).success).toBe(true);
  });

  it("revokes with DELETE and explains a member's last assignment", async () => {
    await actions.revokeBranchAssignment(
      null,
      form({ idempotencyKey: KEY, assignmentId: ASSIGNMENT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(`/api/v1/tenant/branch-assignments/${ASSIGNMENT}`, KEY);

    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.revokeBranchAssignment(null, form({}))).toMatchObject({
      formError: expect.stringContaining('last branch assignment') as unknown,
    });
  });
});
