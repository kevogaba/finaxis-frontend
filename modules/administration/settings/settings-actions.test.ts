import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const { apiPut, apiDelete } = vi.hoisted(() => ({
  apiPut: vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
    Promise.resolve({}),
  ),
  // A1's order: the key second, the optional body last.
  apiDelete: vi.fn((_path: string, _key: string, _body?: Record<string, unknown>) =>
    Promise.resolve(undefined),
  ),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiPut: (path: string, body: Record<string, unknown>, key: string) => apiPut(path, body, key),
  apiDelete: (path: string, key: string, body?: Record<string, unknown>) =>
    apiDelete(path, key, body),
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
      // Mirrors describeProblem closely enough to exercise the actions' own explanations.
      const code = error instanceof BackendApiError ? error.code : null;
      return {
        ok: false,
        formError: 'Backend failure.',
        fieldErrors: {},
        code,
        requestId: 'req-1',
      };
    }
    return { ok: true };
  },
}));

const { resetSetting, updateSetting } = await import('./settings-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const INVITES = 'require_maker_checker_for_user_invites';
const ADVANCE = 'business_date_auto_advance_enabled';

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
  });

  it('puts the chosen value, snake_case only, with the client key', async () => {
    await expect(
      updateSetting(
        null,
        form({
          idempotencyKey: KEY,
          key: 'default_timezone',
          value: ' Africa/Kampala ',
          reason: '',
        }),
      ),
    ).resolves.toEqual({ ok: true });
    expect(apiPut).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/default_timezone',
      { value: 'Africa/Kampala' },
      KEY,
    );

    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: INVITES, value: 'true', reason: ' Audit ' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      `/api/v1/tenant/settings/${INVITES}`,
      { value: 'true', reason: 'Audit' },
      KEY,
    );
  });

  it('needs a reason of at least 3 characters to turn a maker-checker switch off', async () => {
    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: INVITES, value: 'false', reason: ' ok ' }),
      ),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    await expect(
      updateSetting(
        null,
        form({
          idempotencyKey: KEY,
          key: 'require_maker_checker_for_branch_creation',
          value: 'false',
        }),
      ),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    // The platform lowercases a boolean, so a crafted `False` turns it off too: same rule.
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: INVITES, value: 'False' })),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(apiPut).not.toHaveBeenCalled();

    await updateSetting(
      null,
      form({ idempotencyKey: KEY, key: INVITES, value: 'false', reason: 'Two-person team' }),
    );
    expect(apiPut).toHaveBeenLastCalledWith(
      `/api/v1/tenant/settings/${INVITES}`,
      { value: 'false', reason: 'Two-person team' },
      KEY,
    );
    // Automatic advance relaxes no control.
    await updateSetting(null, form({ idempotencyKey: KEY, key: ADVANCE, value: 'false' }));
    expect(apiPut).toHaveBeenLastCalledWith(
      `/api/v1/tenant/settings/${ADVANCE}`,
      { value: 'false' },
      KEY,
    );
  });

  it('names a refused value on its field', async () => {
    apiPut.mockRejectedValueOnce(new BackendApiError(422, { code: 'invalid_operation' }));

    await expect(
      updateSetting(
        null,
        form({ idempotencyKey: KEY, key: 'default_timezone', value: 'Mars/Olympus' }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      formError: "This value isn't valid for this setting.",
      fieldErrors: { value: "This value isn't valid for this setting." },
      code: 'invalid_operation',
      requestId: 'req-1',
    });
  });

  it('explains a refused automatic advance as the missing advance permission', async () => {
    apiPut.mockRejectedValue(new BackendApiError(403, { code: 'forbidden' }));

    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: ADVANCE, value: 'true' })),
    ).resolves.toMatchObject({
      ok: false,
      formError: 'Turning on automatic advance needs permission to advance the business date.',
      code: 'forbidden',
    });
    // Turning it off needs no more than settings.update, so that refusal keeps the generic copy.
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: ADVANCE, value: 'false' })),
    ).resolves.toMatchObject({ ok: false, formError: 'Backend failure.' });
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: INVITES, value: 'true' })),
    ).resolves.toMatchObject({ ok: false, formError: 'Backend failure.' });
    apiPut.mockReset();
  });

  it('resets with {} or {reason}', async () => {
    await resetSetting(null, form({ idempotencyKey: KEY, key: 'default_timezone', reason: '  ' }));
    expect(apiDelete).toHaveBeenLastCalledWith('/api/v1/tenant/settings/default_timezone', KEY, {});

    await resetSetting(null, form({ idempotencyKey: KEY, key: INVITES, reason: 'Typo' }));
    expect(apiDelete).toHaveBeenLastCalledWith(`/api/v1/tenant/settings/${INVITES}`, KEY, {
      reason: 'Typo',
    });
  });

  it('refuses read-only or unknown keys, a blank value, or a missing key before any call', async () => {
    for (const key of ['base_currency', 'audit_retention_days', 'settings.operational']) {
      await expect(resetSetting(null, form({ idempotencyKey: KEY, key }))).resolves.toMatchObject({
        ok: false,
        fieldErrors: { key: expect.any(String) },
      });
      await expect(
        updateSetting(null, form({ idempotencyKey: KEY, key, value: 'UGX' })),
      ).resolves.toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } });
    }
    await expect(
      updateSetting(null, form({ idempotencyKey: KEY, key: 'default_timezone', value: '   ' })),
    ).resolves.toMatchObject({ ok: false, fieldErrors: { value: expect.any(String) } });
    await expect(resetSetting(null, form({ key: 'default_timezone' }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { idempotencyKey: expect.any(String) },
    });
    expect(apiPut).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });
});
