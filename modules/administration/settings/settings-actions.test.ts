import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const { apiPut, apiDelete, flag, getAuthenticatedUser } = vi.hoisted(() => ({
  apiPut: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve({}),
  ),
  // A1's order: the key second, the optional body last.
  apiDelete: vi.fn((_path: string, _key: string, _body?: Record<string, unknown>) =>
    Promise.resolve(undefined),
  ),
  flag: { enabled: true },
  getAuthenticatedUser: vi.fn(() => Promise.resolve<unknown>({ id: 'user-1' })),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPut: (path: string, body: Record<string, unknown>, key: string) => apiPut(path, body, key),
  apiDelete: (path: string, key: string, body?: Record<string, unknown>) =>
    apiDelete(path, key, body),
}));
// The flag-off path checks the session itself (runServerAction's mock below skips it).
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));
vi.mock('./settings-flags', () => ({
  get SETTINGS_EDIT_ENABLED() {
    return flag.enabled;
  },
}));
// Pass-through, but mirrors the real safeParse failure shape (action-result.ts): this test covers
// each action's fields and body; runServerAction has its own test.
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: async (
    schema: z.ZodType,
    formData: FormData,
    run: (input: unknown) => Promise<unknown>,
  ) => {
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.map(String).join('.')] ??= issue.message;
      }
      return {
        ok: false,
        formError: 'Check the highlighted fields and try again.',
        fieldErrors,
        code: 'validation_failed',
        requestId: null,
      };
    }
    try {
      await run(parsed.data);
    } catch (error) {
      // Mirrors describeProblem's mapping closely enough to exercise withSettingProblem's `path`.
      const code = error instanceof BackendApiError ? error.code : null;
      return { ok: false, formError: 'Backend failure.', fieldErrors: {}, code, requestId: null };
    }
    return { ok: true };
  },
}));

const { resetSetting, updateSetting } = await import('./settings-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flag.enabled = true;
  });

  it('puts the chosen value, snake_case only, with the client key', async () => {
    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: 'default_timezone', value: ' Africa/Kampala ', reason: '' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/default_timezone',
      { value: 'Africa/Kampala' },
      KEY,
    );

    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: 'base_currency', value: 'UGX', reason: ' Moved ' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/base_currency',
      { value: 'UGX', reason: 'Moved' },
      KEY,
    );
  });

  it('never calls the backend while editing ships disabled (BG-04), even when invoked directly', async () => {
    flag.enabled = false;

    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'default_timezone', value: 'Africa/Kampala' }),
      ),
    ).resolves.toMatchObject({ ok: false, code: 'settings_edit_unavailable' });
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('checks the session before the flag guard (index: every Server Action does)', async () => {
    flag.enabled = false;
    getAuthenticatedUser.mockResolvedValueOnce(null);

    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'default_timezone', value: 'Africa/Kampala' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/login?reason=session_expired');
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('resets with {} or {reason}, whatever the flag says', async () => {
    flag.enabled = false;

    await resetSetting(null, form({ idempotencyKey: KEY, key: 'base_currency', reason: '  ' }));
    expect(apiDelete).toHaveBeenLastCalledWith('/api/v1/tenant/settings/base_currency', KEY, {});

    await resetSetting(null, form({ idempotencyKey: KEY, key: 'base_currency', reason: 'Typo' }));
    expect(apiDelete).toHaveBeenLastCalledWith('/api/v1/tenant/settings/base_currency', KEY, {
      reason: 'Typo',
    });
  });

  it('keeps the value-specific invalid_operation message off a failed reset (C2)', async () => {
    apiDelete.mockRejectedValueOnce(new BackendApiError(422, { code: 'invalid_operation' }));

    const result = await resetSetting(
      null,
      form({ idempotencyKey: KEY, key: 'base_currency', reason: '' }),
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid_operation' });
    expect(result).not.toHaveProperty('fieldErrors.value');
  });

  it('refuses read-only or unknown keys, a blank value, or a missing key before any call', async () => {
    await expect(
      resetSetting(null, form({ idempotencyKey: KEY, key: 'audit_retention_days' })),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } });
    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'require_maker_checker_for_user_invites', value: 'true' }),
      ),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } });
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: 'default_timezone', value: '   ' })),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { value: expect.any(String) } });
    await expect(resetSetting(null, form({ key: 'base_currency' }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { idempotencyKey: expect.any(String) },
    });
    expect(apiPut).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });
});
