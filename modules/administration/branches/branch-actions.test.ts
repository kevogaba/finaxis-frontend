import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const { apiDelete, apiPatch, apiPost, redirect, refresh, runServerAction } = vi.hoisted(() => ({
  apiPost: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiPatch: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve<unknown>({}),
  ),
  apiDelete: vi.fn((_path: string, _key: string) => Promise.resolve<unknown>({})),
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
  apiPatch: (path: string, body: Record<string, unknown>, key: string) => apiPatch(path, body, key),
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
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';

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

  it('sends a create address only with its non-blank fields, and none when all are blank', async () => {
    const draft = {
      idempotencyKey: KEY,
      branchCode: 'NAIROBI_CBD',
      branchName: 'Nairobi CBD Branch',
      branchType: 'OPERATIONS',
      parentBranchId: '',
      timezone: 'Africa/Nairobi',
    };
    apiPost.mockResolvedValue({ branch_id: BRANCH, status: 'DRAFT' });
    const blank = { line_1: ' ', line_2: '', city: '', region: '', postal_code: '' };
    await expect(actions.createBranchDraft(null, form({ ...draft, ...blank }))).rejects.toThrow();
    expect(apiPost.mock.lastCall?.[1]).not.toHaveProperty('address');

    await expect(
      actions.createBranchDraft(
        null,
        form({ ...draft, ...blank, line_1: ' Kenyatta Avenue ', postal_code: '00100' }),
      ),
    ).rejects.toThrow();
    expect(apiPost.mock.lastCall?.[1]).toMatchObject({
      address: { line_1: 'Kenyatta Avenue', postal_code: '00100' },
    });
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

  describe('updateBranch (BG-13)', () => {
    const update = (fields: Record<string, string>) =>
      actions.updateBranch(null, form({ idempotencyKey: KEY, branchId: BRANCH, ...fields }));
    const NO_ADDRESS = { line_1: '', line_2: '', city: '', region: '', postal_code: '' };

    it('patches only the fields the form sent, then shows the record', async () => {
      await expect(update({ branchName: ' Westlands Mall ' })).rejects.toThrow(
        `NEXT_REDIRECT:/admin/branches/${BRANCH}`,
      );
      expect(apiPatch).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/branches/${BRANCH}`,
        { branch_name: 'Westlands Mall' },
        KEY,
      );
      // Before the redirect: the record layout's hero shows the new name.
      expect(refresh).toHaveBeenCalledTimes(1);

      await expect(
        update({ parentBranchId: HEAD_OFFICE, timezone: 'Africa/Kampala' }),
      ).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({
        parent_branch_id: HEAD_OFFICE,
        timezone: 'Africa/Kampala',
      });
    });

    it('detaches the parent with an explicit null', async () => {
      await expect(update({ parentBranchId: '' })).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({ parent_branch_id: null });
    });

    it('replaces the address whole, {} when every field is blank', async () => {
      await expect(update(NO_ADDRESS)).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({ address: {} });

      await expect(update({ ...NO_ADDRESS, city: ' Kisumu ' })).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({ address: { city: 'Kisumu' } });
    });

    it('keeps the stored keys outside the five (decision Q9)', async () => {
      await expect(
        update({
          ...NO_ADDRESS,
          city: 'Kisumu',
          otherAddress: JSON.stringify({ building: 'Block B', city: 'Ignored' }),
        }),
      ).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({
        address: { city: 'Kisumu', building: 'Block B' },
      });
      // With no address field sent the address is unchanged, whatever else came along.
      await expect(
        update({ branchName: 'Kisumu', otherAddress: '{"building":"Block B"}' }),
      ).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({ branch_name: 'Kisumu' });
    });

    it('refuses bad input before calling the backend', async () => {
      const bad: Record<string, string>[] = [
        { branchName: 'N' },
        { timezone: '+03:00' },
        { parentBranchId: 'not-a-uuid' },
        { ...NO_ADDRESS, otherAddress: 'not json' },
        { ...NO_ADDRESS, otherAddress: '{"floor":3}' },
      ];
      for (const fields of bad) {
        await expect(update(fields)).rejects.toThrow();
      }
      expect(apiPatch).not.toHaveBeenCalled();
    });

    // The form caps a value the user changed (branchEditSchema); a stored one goes back as stored.
    it('sends a long address value as it is, since the platform caps none', async () => {
      const long = 'x'.repeat(121);
      await expect(update({ ...NO_ADDRESS, line_1: long, city: 'Kisumu' })).rejects.toThrow();
      expect(apiPatch.mock.lastCall?.[1]).toEqual({ address: { line_1: long, city: 'Kisumu' } });
    });

    it('asks for a reload when the stored keys outside the five fail to parse', async () => {
      runServerAction.mockResolvedValueOnce({
        ...failure('validation_failed'),
        formError: 'Check the highlighted fields and try again.',
        fieldErrors: { otherAddress: 'Reload the page and try again.' },
      });
      // No field shows `otherAddress`, so nothing would be highlighted: the form says it instead.
      expect(await update({ ...NO_ADDRESS, otherAddress: 'not json' })).toEqual({
        ok: false,
        code: 'validation_failed',
        requestId: 'req-1',
        formError:
          "We couldn't keep this branch's other address details. Reload the page and try again.",
        fieldErrors: {},
      });
    });

    // Review Focus 2: the form's key, never one of the action's own, so a retry replays.
    it('reuses the minted key on retry', async () => {
      apiPatch.mockRejectedValueOnce(new Error('network'));
      runServerAction.mockImplementation(
        async (
          schema: z.ZodType,
          formData: FormData,
          run: (input: unknown) => Promise<unknown>,
        ) => {
          try {
            await run(schema.parse(Object.fromEntries(formData)));
            return { ok: true };
          } catch (error) {
            if (String(error).includes('NEXT_REDIRECT')) throw error;
            return failure('network_error');
          }
        },
      );
      expect(await update({ branchName: 'Westlands Mall' })).toMatchObject({ ok: false });
      await expect(update({ branchName: 'Westlands Mall' })).rejects.toThrow('NEXT_REDIRECT');
      expect(apiPatch.mock.calls.map((call) => call[2])).toEqual([KEY, KEY]);
    });

    // Review Focus 1: changed or decided elsewhere, each refusal is named, never echoed.
    it.each([
      [
        'conflict',
        'This branch can no longer be edited in its current state, or the parent you chose has closed. Refresh and check.',
      ],
      [
        'invalid_operation',
        "The time zone or parent branch isn't accepted. A branch can't be its own ancestor.",
      ],
      ['resource_not_found', 'The parent branch no longer exists.'],
    ])('explains a %s', async (code, formError) => {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.updateBranch(null, form({}))).toMatchObject({
        code,
        requestId: 'req-1',
        formError,
      });
    });

    it('leaves other refusals to their status', async () => {
      runServerAction.mockResolvedValueOnce(failure('forbidden'));
      expect(await actions.updateBranch(null, form({}))).toMatchObject({ formError: 'generic' });
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

  it.each(['suspendBranch', 'closeBranch', 'returnBranch', 'discardBranch'] as const)(
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
        expect.stringMatching(new RegExp(`/branches/${BRANCH}/(suspend|close|return|discard)$`)),
        { reason: 'Cash count' },
        KEY,
      );
    },
  );

  // Withdraw and Return are one route: the platform tells them apart by the caller.
  it.each([
    ['returnBranch', 'return'],
    ['discardBranch', 'discard'],
  ] as const)('%s posts the trimmed reason to /%s with the minted key', async (name, path) => {
    await actions[name](
      null,
      form({ idempotencyKey: KEY, branchId: BRANCH, reason: '  Wrong parent  ' }),
    );
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/branches/${BRANCH}/${path}`,
      { reason: 'Wrong parent' },
      KEY,
    );
  });

  // Review Focus 2: the action sends the form's key, never one of its own, so a retry replays.
  it.each(['returnBranch', 'discardBranch'] as const)(
    '%s reuses the minted key on retry',
    async (name) => {
      apiPost.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
      runServerAction.mockImplementation(
        async (
          schema: z.ZodType,
          formData: FormData,
          run: (input: unknown) => Promise<unknown>,
        ) => {
          try {
            await run(schema.parse(Object.fromEntries(formData)));
            return { ok: true };
          } catch {
            return failure('network_error');
          }
        },
      );
      const fields = form({ idempotencyKey: KEY, branchId: BRANCH, reason: 'Wrong parent' });

      expect(await actions[name](null, fields)).toMatchObject({ ok: false });
      expect(await actions[name](null, fields)).toEqual({ ok: true });
      expect(apiPost.mock.calls.map((call) => call[2])).toEqual([KEY, KEY]);
    },
  );

  // Review Focus 1: a request withdrawn, returned or decided elsewhere names its refusal.
  it('explains a return of a branch already decided elsewhere, and leaves others alone', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.returnBranch(null, form({}))).toMatchObject({
      code: 'conflict',
      requestId: 'req-1',
      formError:
        "This branch isn't waiting for approval any more: it was decided, returned or withdrawn elsewhere. Refresh to see where it stands.",
    });

    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.returnBranch(null, form({}))).toMatchObject({ formError: 'generic' });
  });

  it.each([
    ['lifecycle.head_office_branch_protected', "The head office can't be discarded."],
    [
      'conflict',
      'This draft still has an active child branch or assignment, or it changed. Refresh and check.',
    ],
  ])('explains a discard refused with %s', async (code, formError) => {
    runServerAction.mockResolvedValueOnce(failure(code));
    expect(await actions.discardBranch(null, form({}))).toMatchObject({
      code,
      requestId: 'req-1',
      formError,
    });
  });

  it('explains an activation `forbidden` as a missing permission only (BG-08) and leaves others alone', async () => {
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.activateBranch(null, form({}))).toMatchObject({
      code: 'forbidden',
      formError: "You can't activate this branch. Your role doesn't allow it.",
    });

    // The maker and the editors have their own codes, explained by describeProblem.
    for (const code of [
      'conflict',
      'lifecycle.approver_is_branch_maker',
      'lifecycle.approver_is_branch_modifier',
    ]) {
      runServerAction.mockResolvedValueOnce(failure(code));
      expect(await actions.activateBranch(null, form({}))).toMatchObject({
        formError: 'generic',
      });
    }
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
