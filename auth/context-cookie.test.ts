import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, serverEnv } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  serverEnv: { NODE_ENV: 'development' },
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('@/config/env.server', () => ({ serverEnv }));

const { clearContextToken, readContextToken, setContextToken } = await import('./context-cookie');

describe('context cookie', () => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    serverEnv.NODE_ENV = 'development';
    cookiesMock.mockResolvedValue(cookieStore);
  });

  it('reads the context token from an explicitly supplied request header', async () => {
    await expect(
      readContextToken(new Headers({ cookie: 'finaxis_context=signed-token' })),
    ).resolves.toBe('signed-token');
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('reads and decodes a context token from a cookie header', async () => {
    await expect(
      readContextToken(new Headers({ cookie: 'other=value; finaxis_context=signed%2Dtoken' })),
    ).resolves.toBe('signed-token');
  });

  it('returns no token when the request has no cookie or the cookie name is invalid', async () => {
    await expect(readContextToken(new Headers())).resolves.toBeNull();
    await expect(
      readContextToken(new Headers({ cookie: 'finaxis-context=wrong-name' })),
    ).resolves.toBeNull();
  });

  it('reads the context token from the framework cookie store when no headers are supplied', async () => {
    cookieStore.get.mockReturnValueOnce({ value: 'stored-token' });

    await expect(readContextToken()).resolves.toBe('stored-token');
    expect(cookieStore.get).toHaveBeenCalledWith('finaxis_context');
  });

  it('treats a malformed context cookie as absent', async () => {
    await expect(
      readContextToken(new Headers({ cookie: 'finaxis_context=%' })),
    ).resolves.toBeNull();
  });

  it('sets an HttpOnly, same-site root cookie without secure in development', async () => {
    await setContextToken('signed-token');

    expect(cookieStore.set).toHaveBeenCalledWith(
      'finaxis_context',
      'signed-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
  });

  it('sets a secure context cookie in production', async () => {
    serverEnv.NODE_ENV = 'production';

    await setContextToken('signed-token');

    expect(cookieStore.set).toHaveBeenCalledWith(
      'finaxis_context',
      'signed-token',
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears the root context cookie', async () => {
    await clearContextToken();

    expect(cookieStore.delete).toHaveBeenCalledWith({ name: 'finaxis_context', path: '/' });
  });
});
