import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';

const refresh = vi.fn();
const getAuthenticatedUser = vi.fn();
vi.mock('next/cache', () => ({ refresh: () => refresh() as unknown }));
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve(new Headers({ 'x-finaxis-pathname': '/admin/business-date' })),
  ),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT')) throw error;
  }),
}));
vi.mock('@/auth/get-authenticated-user', () => ({
  getAuthenticatedUser: () => getAuthenticatedUser() as unknown,
}));

const { runServerAction } = await import('./action-result');

const KEY = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const schema = z.object({ idempotencyKey: z.uuid(), reason: z.string().max(5) });

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => {
    data.set(name, value);
  });
  return data;
}

describe('runServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
  });

  it('runs with the parsed fields (including the client key) and refreshes', async () => {
    const run = vi.fn(() => Promise.resolve());

    await expect(
      runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), run),
    ).resolves.toEqual({
      ok: true,
    });
    expect(run).toHaveBeenCalledWith({ idempotencyKey: KEY, reason: 'ok' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns field errors without calling the backend', async () => {
    const run = vi.fn();

    const result = await runServerAction(
      schema,
      form({ idempotencyKey: KEY, reason: 'too long' }),
      run,
    );

    expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(result.ok ? null : result.fieldErrors.reason).toEqual(expect.any(String));
    expect(run).not.toHaveBeenCalled();
  });

  it('maps backend failures to a safe result with the support reference', async () => {
    const result = await runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), () =>
      Promise.reject(
        new BackendApiError(409, {
          code: 'lifecycle.business_date_lock_timeout',
          requestId: 'req-7',
        }),
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {},
      code: 'lifecycle.business_date_lock_timeout',
      requestId: 'req-7',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('redirects an expired session and a stale context', async () => {
    getAuthenticatedUser.mockResolvedValueOnce(null);
    await expect(runServerAction(schema, form({}), vi.fn())).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );

    await expect(
      runServerAction(schema, form({ idempotencyKey: KEY, reason: 'ok' }), () =>
        Promise.reject(new BackendApiError(403, { code: 'invalid_active_tenant_context' })),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/select-context?next=%2Fadmin%2Fbusiness-date');
  });
});
