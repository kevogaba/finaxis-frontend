import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const get = vi.fn();
vi.mock('@/auth/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/backend-api')>();
  return { ...actual, backendApi: { get: (...args: unknown[]) => get(...args) as unknown } };
});

const readContextToken = vi.fn();
vi.mock('@/auth/context-cookie', () => ({
  readContextToken: (...args: unknown[]) => readContextToken(...args) as unknown,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ 'x-test': '1' }))),
}));

const { apiGet } = await import('./tenant-api');

const SCHEMA = z.object({ timezone: z.string() });

beforeEach(() => {
  get.mockReset();
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
