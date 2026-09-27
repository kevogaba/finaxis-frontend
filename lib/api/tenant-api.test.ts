import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();
vi.mock('@/auth/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/backend-api')>();
  return {
    ...actual,
    backendApi: {
      get: (...args: unknown[]) => get(...args) as unknown,
      post: (...args: unknown[]) => post(...args) as unknown,
      put: (...args: unknown[]) => put(...args) as unknown,
      patch: (...args: unknown[]) => patch(...args) as unknown,
      delete: (...args: unknown[]) => del(...args) as unknown,
    },
  };
});

const readContextToken = vi.fn();
vi.mock('@/auth/context-cookie', () => ({
  readContextToken: (...args: unknown[]) => readContextToken(...args) as unknown,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ 'x-test': '1' }))),
}));

const { apiGet, apiPost, apiPut, apiPatch, apiDelete } = await import('./tenant-api');

const SCHEMA = z.object({ timezone: z.string() });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
  patch.mockReset();
  del.mockReset();
  readContextToken.mockReset();
});

describe('apiGet', () => {
  it('rejects with a 403 invalid_active_tenant_context and never calls backendApi with no context token', async () => {
    readContextToken.mockResolvedValue(null);

    await expect(apiGet('/api/v1/tenant', SCHEMA)).rejects.toMatchObject({
      status: 403,
      code: 'invalid_active_tenant_context',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('passes the request headers and context token through to backendApi.get', async () => {
    readContextToken.mockResolvedValue('ctx-token');
    get.mockResolvedValue({ timezone: 'Africa/Nairobi' });

    const result = await apiGet('/api/v1/tenant', SCHEMA);

    expect(result).toEqual({ timezone: 'Africa/Nairobi' });
    expect(get).toHaveBeenCalledWith('/api/v1/tenant', expect.any(Headers), 'ctx-token');
  });

  it('rejects a response that fails the schema', async () => {
    readContextToken.mockResolvedValue('ctx-token');
    get.mockResolvedValue({ timezone: 42 });

    await expect(apiGet('/api/v1/tenant', SCHEMA)).rejects.toThrow();
  });
});

describe('apiPost', () => {
  it('sends the body with the context token and the caller key', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    post.mockResolvedValueOnce({ ok: true });

    await apiPost('/api/v1/tenant/business-date/reopen', {}, 'key-1');

    expect(post).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date/reopen',
      {},
      expect.any(Headers),
      'ctx-token',
      'key-1',
    );
  });

  it('treats a missing context token as a stale context', async () => {
    readContextToken.mockResolvedValueOnce(null);

    await expect(apiPost('/api/v1/tenant/business-date/reopen', {}, 'key-1')).rejects.toMatchObject(
      {
        status: 403,
        code: 'invalid_active_tenant_context',
      },
    );
    expect(post).not.toHaveBeenCalled();
  });
});

describe('apiPut', () => {
  it('sends the body with the context token and the caller key', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    put.mockResolvedValueOnce({ ok: true });

    await apiPut('/api/v1/tenant/business-date', { new_business_date: '08-09-2026' }, 'key-2');

    expect(put).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date',
      { new_business_date: '08-09-2026' },
      expect.any(Headers),
      'ctx-token',
      'key-2',
    );
  });
});

describe('apiPatch', () => {
  it('sends the body with the context token and the caller key', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    patch.mockResolvedValueOnce({ ok: true });

    await apiPatch('/api/v1/tenant/business-date', { reason: 'fix' }, 'key-3');

    expect(patch).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date',
      { reason: 'fix' },
      expect.any(Headers),
      'ctx-token',
      'key-3',
    );
  });
});

describe('apiDelete', () => {
  it('sends the context token and the caller key with an optional body', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    del.mockResolvedValueOnce(undefined);

    await apiDelete('/api/v1/tenant/business-date/history/1', 'key-4', { reason: 'cleanup' });

    expect(del).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date/history/1',
      expect.any(Headers),
      'ctx-token',
      'key-4',
      { reason: 'cleanup' },
    );
  });

  it('omits the body when none is given', async () => {
    readContextToken.mockResolvedValueOnce('ctx-token');
    del.mockResolvedValueOnce(undefined);

    await apiDelete('/api/v1/tenant/business-date/history/1', 'key-4');

    expect(del).toHaveBeenCalledWith(
      '/api/v1/tenant/business-date/history/1',
      expect.any(Headers),
      'ctx-token',
      'key-4',
      undefined,
    );
  });
});
