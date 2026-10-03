import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

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
const { getRole } = vi.hoisted(() => ({
  getRole: vi.fn((_roleId: string) => Promise.resolve<unknown>({ status: 'ACTIVE' })),
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
vi.mock('./role-service', () => ({ getRole: (roleId: string) => getRole(roleId) }));

const actions = await import('./role-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_KEY = '1b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const ROLE = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000d';
const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

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

/** What the real runServerAction does with a thrown failure (it has its own test). */
async function settle(schema: z.ZodType, formData: FormData, run: Run) {
  try {
    await run(schema.parse(Object.fromEntries(formData)));
    return { ok: true };
  } catch (error) {
    const typed = error instanceof BackendApiError ? error : null;
    return {
      ...failure(typed?.code ?? 'internal_error'),
      requestId: typed?.requestId ?? null,
    };
  }
}

const keysSent = () => apiPost.mock.calls.map(([, , key]) => key);

describe('role actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pass-through: this file covers fields, bodies, and messages; runServerAction has its own test.
    runServerAction.mockImplementation(async (schema: z.ZodType, formData: FormData, run: Run) => {
      await run(schema.parse(Object.fromEntries(formData)));
      return { ok: true };
    });
  });

  it('creates a role with an explicit snake_case body and lands on its Permissions tab', async () => {
    apiPost.mockResolvedValueOnce({ id: ROLE, status: 'ACTIVE' });

    await expect(
      actions.createRole(
        null,
        form({
          idempotencyKey: KEY,
          roleCode: 'CREDIT_CLERK',
          roleName: ' Credit clerk ',
          description: '',
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/roles/${ROLE}/permissions`);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/tenant/roles',
      { role_code: 'CREDIT_CLERK', role_name: 'Credit clerk', description: null },
      KEY,
    );
  });

  it("points a create 409 at the code without claiming it's a duplicate", async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.createRole(null, form({}))).toMatchObject({
      code: 'conflict',
      requestId: 'req-1',
      fieldErrors: { roleCode: 'This code may already be in use.' },
      formError: expect.stringContaining('may already be in use') as unknown,
    });
  });

  it('updates the name, keeps a blank description (null), and returns to the record', async () => {
    await expect(
      actions.updateRole(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, roleName: 'Senior teller', description: ' ' }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/roles/${ROLE}`);
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}`,
      { role_name: 'Senior teller', description: null },
      KEY,
    );
    // Before the redirect, so the shared record layout's hero re-renders with the new name.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['activateRole', 'activate'],
    ['deactivateRole', 'deactivate'],
  ] as const)('%s posts {} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, roleId: ROLE }));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/tenant/roles/${ROLE}/${path}`, {}, KEY);
  });

  it('explains a 409 as an immutable role and leaves other failures alone', async () => {
    for (const action of [
      actions.updateRole,
      actions.deactivateRole,
      actions.removePermission,
      actions.grantPermissions,
    ]) {
      runServerAction.mockResolvedValueOnce(failure('conflict'));
      expect(await action(null, form({}))).toMatchObject({
        formError: expect.stringContaining('system roles are immutable') as unknown,
      });
    }
    runServerAction.mockResolvedValueOnce(failure('forbidden'));
    expect(await actions.activateRole(null, form({}))).toMatchObject({ formError: 'generic' });
  });

  it('derives one stable, canonical key per code from the form key (Ruling 5)', async () => {
    const fields = {
      idempotencyKey: KEY,
      roleId: ROLE,
      permissionCodes: 'cob.start, business_date.view,cob.start',
    };
    await actions.grantPermissions(null, form(fields));
    expect(apiPost.mock.calls.map(([path, body]) => [path, body])).toEqual([
      [`/api/v1/tenant/roles/${ROLE}/permissions`, { permission_code: 'cob.start' }],
      [`/api/v1/tenant/roles/${ROLE}/permissions`, { permission_code: 'business_date.view' }],
    ]);
    const keys = keysSent();
    expect(keys[0]).toMatch(CANONICAL);
    expect(keys[1]).toMatch(CANONICAL);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).not.toContain(KEY);

    // The same form retried replays the same writes; a new opening's key derives new ones.
    apiPost.mockClear();
    await actions.grantPermissions(null, form(fields));
    expect(keysSent()).toEqual(keys);
    apiPost.mockClear();
    await actions.grantPermissions(null, form({ ...fields, idempotencyKey: OTHER_KEY }));
    expect(keysSent()).not.toContain(keys[0]);
  });

  it('refuses no codes or more than 25 before calling the backend', async () => {
    await expect(
      actions.grantPermissions(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, permissionCodes: '' }),
      ),
    ).rejects.toThrow();
    const many = Array.from({ length: 26 }, (_, index) => `code.n${String(index)}`).join(',');
    await expect(
      actions.grantPermissions(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, permissionCodes: many }),
      ),
    ).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('a partial failure refreshes and says how many landed', async () => {
    // The real runServerAction turns a thrown backend error into a failure result.
    runServerAction.mockImplementationOnce(
      async (schema: z.ZodType, formData: FormData, run: Run) => {
        try {
          await run(schema.parse(Object.fromEntries(formData)));
          return { ok: true };
        } catch {
          return failure('internal_error');
        }
      },
    );
    apiPost.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('network'));

    const result = await actions.grantPermissions(
      null,
      form({
        idempotencyKey: KEY,
        roleId: ROLE,
        permissionCodes: 'cob.start,cob.complete,branch.view',
      }),
    );

    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      formError: '1 of 3 permissions were granted before this failed. generic Retrying is safe.',
    });
  });

  it('removes a grant with DELETE', async () => {
    await actions.removePermission(
      null,
      form({ idempotencyKey: KEY, roleId: ROLE, grantId: GRANT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(
      `/api/v1/tenant/roles/${ROLE}/permissions/${GRANT}`,
      KEY,
    );
  });

  it('assigns with an explicit scope body: TENANT sends no branch, BRANCH needs one', async () => {
    const assign = (fields: Record<string, string>) =>
      actions.assignRole(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, userId: USER, ...fields }),
      );

    await assign({ scopeType: 'TENANT' });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      { user_id: USER, role_id: ROLE, scope_type: 'TENANT', branch_id: null },
      KEY,
    );
    await assign({ scopeType: 'BRANCH', branchId: BRANCH });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      { user_id: USER, role_id: ROLE, scope_type: 'BRANCH', branch_id: BRANCH },
      KEY,
    );
    // A branch left over from a scope change never travels with TENANT scope (else 422).
    await assign({ scopeType: 'TENANT', branchId: BRANCH });
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/role-assignments',
      expect.objectContaining({ branch_id: null }),
      KEY,
    );

    apiPost.mockClear();
    // BRANCH with no branch is a 500 at source f74e44b (BG-07): refused before the backend.
    await expect(assign({ scopeType: 'BRANCH', branchId: '' })).rejects.toThrow();
    await expect(assign({ scopeType: 'BRANCH' })).rejects.toThrow();
    await expect(assign({ scopeType: 'TENANT', userId: '' })).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('names the branch-assignment guard on an assign 409', async () => {
    runServerAction.mockResolvedValueOnce(failure('conflict'));
    expect(await actions.assignRole(null, form({}))).toMatchObject({
      formError: expect.stringContaining('must already be assigned to that branch') as unknown,
    });
  });

  it('revokes with DELETE', async () => {
    await actions.revokeRoleAssignment(
      null,
      form({ idempotencyKey: KEY, assignmentId: ASSIGNMENT }),
    );
    expect(apiDelete).toHaveBeenCalledWith(`/api/v1/tenant/role-assignments/${ASSIGNMENT}`, KEY);
  });

  describe('assigning re-reads the role first (BG-27)', () => {
    const assign = () =>
      actions.assignRole(
        null,
        form({ idempotencyKey: KEY, roleId: ROLE, userId: USER, scopeType: 'TENANT' }),
      );
    const NOT_ACTIVE =
      "This role is no longer active, so it can't be assigned. Refresh the page and check its status.";

    it('posts the same body and key for an ACTIVE role', async () => {
      runServerAction.mockImplementationOnce(settle);
      expect(await assign()).toEqual({ ok: true });
      expect(getRole).toHaveBeenCalledWith(ROLE);
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith(
        '/api/v1/tenant/role-assignments',
        { user_id: USER, role_id: ROLE, scope_type: 'TENANT', branch_id: null },
        KEY,
      );
    });

    it.each(['DISABLED', 'ARCHIVED'])('does not post for a %s role', async (status) => {
      runServerAction.mockImplementationOnce(settle);
      getRole.mockResolvedValueOnce({ status });
      expect(await assign()).toMatchObject({ ok: false, formError: NOT_ACTIVE });
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('fails closed without posting or echoing backend text when the read fails', async () => {
      for (const error of [
        new BackendApiError(404, { requestId: 'req-9' }),
        new Error('secret backend text'),
      ]) {
        runServerAction.mockImplementationOnce(settle);
        getRole.mockRejectedValueOnce(error);
        const result = await assign();
        expect(result).toMatchObject({
          ok: false,
          formError: "Couldn't check the role's status. Try again.",
        });
        expect(JSON.stringify(result)).not.toContain('secret');
      }
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('keeps the error reference of a failed read', async () => {
      runServerAction.mockImplementationOnce(settle);
      getRole.mockRejectedValueOnce(new BackendApiError(500, { requestId: 'req-9' }));
      expect(await assign()).toMatchObject({ ok: false, requestId: 'req-9' });
    });

    it('lets the original read error through, so a lost session still redirects', async () => {
      const lost = new BackendApiError(401);
      getRole.mockRejectedValueOnce(lost);
      await expect(assign()).rejects.toBe(lost);
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('reads nothing and posts nothing when the organisation changed (context_changed)', async () => {
      runServerAction.mockResolvedValueOnce(failure('context_changed'));
      expect(await assign()).toMatchObject({ code: 'context_changed' });
      expect(getRole).not.toHaveBeenCalled();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('reads nothing when the input is refused', async () => {
      await expect(
        actions.assignRole(null, form({ idempotencyKey: KEY, roleId: ROLE, scopeType: 'TENANT' })),
      ).rejects.toThrow();
      expect(getRole).not.toHaveBeenCalled();
    });
  });
});
