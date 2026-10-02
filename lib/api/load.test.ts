import { describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';

vi.mock('next/navigation', async (importOriginal) => {
  // Keeps the real `unstable_rethrow` (a no-op for a plain error, so BackendApiError rejections in
  // this file still fall through as before) instead of leaving it undefined.
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    redirect: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT:${to}`);
    }),
  };
});
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ 'x-finaxis-pathname': '/admin/audit' }))),
}));

const { load } = await import('./load');

describe('load', () => {
  it('returns the value on success', async () => {
    await expect(load(Promise.resolve(42))).resolves.toEqual({ ok: true, value: 42 });
  });

  it('sends a stale or missing context back through context selection', async () => {
    await expect(
      load(Promise.reject(new BackendApiError(403, { code: 'invalid_active_tenant_context' }))),
    ).rejects.toThrow('NEXT_REDIRECT:/select-context?next=%2Fadmin%2Faudit');
  });

  it('sends an expired session to login', async () => {
    await expect(load(Promise.reject(new BackendApiError(401)))).rejects.toThrow(
      'NEXT_REDIRECT:/login?reason=session_expired',
    );
  });

  it('returns a problem view for other failures', async () => {
    await expect(
      load(Promise.reject(new BackendApiError(403, { code: 'forbidden' }))),
    ).resolves.toMatchObject({
      ok: false,
      problem: { title: 'Access denied' },
    });
  });

  it('rethrows a Next.js control-flow error instead of swallowing it', async () => {
    // A real redirect()/notFound() throw carries this digest shape (redirect-error.js); load()
    // must let it keep propagating, never turn it into a generic ErrorState.
    const controlFlowError = new Error('NEXT_REDIRECT');
    (controlFlowError as { digest?: string }).digest = 'NEXT_REDIRECT;push;/somewhere;307;';

    await expect(load(Promise.reject(controlFlowError))).rejects.toBe(controlFlowError);
  });
});
