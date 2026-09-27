import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const apiPost = vi.fn((_path: string, _body: Record<string, unknown>, _key: string) =>
  Promise.resolve({}),
);
vi.mock('@/lib/api/tenant-api', () => ({
  apiPost: (path: string, body: Record<string, unknown>, key: string) => apiPost(path, body, key),
}));
// Pass-through: this test covers each action's fields and body; runServerAction has its own test.
vi.mock('@/lib/api/action-result', () => ({
  runServerAction: async (
    schema: z.ZodType,
    formData: FormData,
    run: (input: unknown) => Promise<unknown>,
  ) => {
    await run(schema.parse(Object.fromEntries(formData)));
    return { ok: true };
  },
}));

const actions = await import('./business-date-actions');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('business date actions', () => {
  beforeEach(() => {
    apiPost.mockClear();
  });

  it.each([
    ['startCloseOfBusiness', '/api/v1/tenant/business-date/cob/start'],
    ['completeCloseOfBusiness', '/api/v1/tenant/business-date/cob/complete'],
    ['reopenBusinessDate', '/api/v1/tenant/business-date/reopen'],
  ] as const)('%s posts {} or {reason} with the client key', async (name, path) => {
    await actions[name](null, form({ idempotencyKey: KEY, reason: '   ' }));
    expect(apiPost).toHaveBeenLastCalledWith(path, {}, KEY);

    await actions[name](null, form({ idempotencyKey: KEY, reason: ' End of day ' }));
    expect(apiPost).toHaveBeenLastCalledWith(path, { reason: 'End of day' }, KEY);
  });

  it('advances with the converted date, snake_case only', async () => {
    await actions.advanceBusinessDate(
      null,
      form({ idempotencyKey: KEY, newBusinessDate: '2026-09-08', reason: '' }),
    );
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/v1/tenant/business-date/advance',
      { new_business_date: '08-09-2026' },
      KEY,
    );
  });

  it('refuses an impossible date or a missing key before calling the backend', async () => {
    await expect(
      actions.advanceBusinessDate(
        null,
        form({ idempotencyKey: KEY, newBusinessDate: '2026-02-30' }),
      ),
    ).rejects.toThrow();
    await expect(actions.startCloseOfBusiness(null, form({ reason: 'x' }))).rejects.toThrow();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
