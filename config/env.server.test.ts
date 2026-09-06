import { describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV: Record<string, string | undefined> = {
  NODE_ENV: 'development',
  BETTER_AUTH_URL: 'http://localhost:3100',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  PLATFORM_ORGANISATION_ID: '8d0cb4e6-521a-4e51-bac0-e4d938c0ee76',
  KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
  KEYCLOAK_CLIENT_ID: 'finaxis-web',
  KEYCLOAK_CLIENT_SECRET: 'secret-value',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3100',
  AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3100/login',
  FINAXIS_API_URL: 'http://localhost:8080',
  // Not part of the schema (read directly off process.env — see
  // config/env.server.ts's isInsecureLocalOriginAllowed) but still reset for every
  // test so a developer's own .env.local can never affect these results.
  FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: undefined,
};

async function loadEnvServerWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const original = { ...process.env };
  const envValues: Record<string, string | undefined> = { ...REQUIRED_ENV, ...overrides };
  for (const [key, value] of Object.entries(envValues)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  try {
    const mod = await import('./env.server');
    // The module's `serverEnv` export is a lazily-validated Proxy: validation runs on first
    // property access, not at import time. Force that access now, while `process.env` still
    // holds the overrides, so callers see the same validate-immediately behavior as before.
    const _forceValidation = mod.serverEnv.BETTER_AUTH_URL;
    return mod;
  } finally {
    process.env = original;
  }
}

describe('serverEnv', () => {
  it('parses a valid, minimal development configuration', async () => {
    const { serverEnv } = await loadEnvServerWith({});
    expect(serverEnv.BETTER_AUTH_URL).toBe('http://localhost:3100');
    expect(serverEnv.AUTH_TRUSTED_ORIGINS).toEqual(['http://localhost:3100']);
  });

  it('defaults REDIS_KEY_PREFIX to finaxis-web', async () => {
    const { serverEnv } = await loadEnvServerWith({});
    expect(serverEnv.REDIS_KEY_PREFIX).toBe('finaxis-web');
  });

  it('accepts a REDIS_KEY_PREFIX override', async () => {
    const { serverEnv } = await loadEnvServerWith({ REDIS_KEY_PREFIX: 'finaxis-web-staging' });
    expect(serverEnv.REDIS_KEY_PREFIX).toBe('finaxis-web-staging');
  });

  it('splits and trims comma-separated trusted origins', async () => {
    const { serverEnv } = await loadEnvServerWith({
      AUTH_TRUSTED_ORIGINS: 'http://localhost:3100, http://localhost:3000',
    });
    expect(serverEnv.AUTH_TRUSTED_ORIGINS).toEqual([
      'http://localhost:3100',
      'http://localhost:3000',
    ]);
  });

  it('throws when a required variable is missing', async () => {
    await expect(loadEnvServerWith({ BETTER_AUTH_SECRET: undefined })).rejects.toThrow(
      /Invalid server environment configuration/,
    );
  });

  it('accepts a valid platform organisation UUID', async () => {
    const { serverEnv } = await loadEnvServerWith({
      PLATFORM_ORGANISATION_ID: '5f01b1bf-bd10-49ea-a0df-072ad35030a4',
    });

    expect(serverEnv.PLATFORM_ORGANISATION_ID).toBe('5f01b1bf-bd10-49ea-a0df-072ad35030a4');
  });

  it('requires PLATFORM_ORGANISATION_ID', async () => {
    await expect(loadEnvServerWith({ PLATFORM_ORGANISATION_ID: undefined })).rejects.toThrow(
      /PLATFORM_ORGANISATION_ID/,
    );
  });

  it('requires PLATFORM_ORGANISATION_ID to be a UUID', async () => {
    await expect(loadEnvServerWith({ PLATFORM_ORGANISATION_ID: 'platform-admin' })).rejects.toThrow(
      /PLATFORM_ORGANISATION_ID/,
    );
  });

  it('requires FINAXIS_API_URL', async () => {
    await expect(loadEnvServerWith({ FINAXIS_API_URL: undefined })).rejects.toThrow(
      /FINAXIS_API_URL/,
    );
  });

  it('requires FINAXIS_API_URL to be a URL', async () => {
    await expect(loadEnvServerWith({ FINAXIS_API_URL: 'not-a-url' })).rejects.toThrow(
      /FINAXIS_API_URL/,
    );
  });

  it('throws when BETTER_AUTH_SECRET is shorter than 32 characters', async () => {
    await expect(loadEnvServerWith({ BETTER_AUTH_SECRET: 'short' })).rejects.toThrow(
      /Invalid server environment configuration/,
    );
  });

  it('rejects a wildcard trusted origin', async () => {
    await expect(
      loadEnvServerWith({ AUTH_TRUSTED_ORIGINS: 'https://*.finaxis.example' }),
    ).rejects.toThrow(/wildcard/);
  });

  it('rejects a post-logout redirect URI outside the trusted origins', async () => {
    await expect(
      loadEnvServerWith({ AUTH_POST_LOGOUT_REDIRECT_URI: 'http://evil.example/login' }),
    ).rejects.toThrow(/trusted origin/);
  });

  it('requires HTTPS origins in production', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'http://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'http://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'http://app.finaxis.example/login',
      }),
    ).rejects.toThrow(/HTTPS/);
  });

  it('requires HTTPS for the Keycloak issuer in production', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'https://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'https://app.finaxis.example/login',
        KEYCLOAK_ISSUER: 'http://localhost:8080/realms/finaxis',
      }),
    ).rejects.toThrow(/HTTPS/);
  });

  it('requires HTTPS for the platform API URL in production', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'https://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'https://app.finaxis.example/login',
        KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
        FINAXIS_API_URL: 'http://api.finaxis.example',
      }),
    ).rejects.toThrow(/HTTPS/);
  });

  it('allows a local HTTP origin in production when FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1', async () => {
    const { serverEnv } = await loadEnvServerWith({
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'http://localhost:3100',
      AUTH_TRUSTED_ORIGINS: 'http://localhost:3100',
      AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3100/login',
      KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
      FINAXIS_API_URL: 'https://api.finaxis.example',
      REDIS_URL: 'redis://localhost:6379',
      FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1',
    });

    expect(serverEnv.BETTER_AUTH_URL).toBe('http://localhost:3100');
  });

  it('still requires HTTPS for a non-local origin even with FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'http://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'http://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'http://app.finaxis.example/login',
        REDIS_URL: 'redis://localhost:6379',
        FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1',
      }),
    ).rejects.toThrow(/HTTPS/);
  });

  it('does not require REDIS_URL in production when FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1', async () => {
    const { serverEnv } = await loadEnvServerWith({
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'http://localhost:3100',
      AUTH_TRUSTED_ORIGINS: 'http://localhost:3100',
      AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:3100/login',
      KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
      FINAXIS_API_URL: 'https://api.finaxis.example',
      REDIS_URL: undefined,
      FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS: '1',
    });

    expect(serverEnv.REDIS_URL).toBeUndefined();
  });

  it('does not require REDIS_URL outside production', async () => {
    const { serverEnv } = await loadEnvServerWith({ REDIS_URL: undefined });
    expect(serverEnv.REDIS_URL).toBeUndefined();
  });

  it('requires REDIS_URL in production', async () => {
    await expect(
      loadEnvServerWith({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://app.finaxis.example',
        AUTH_TRUSTED_ORIGINS: 'https://app.finaxis.example',
        AUTH_POST_LOGOUT_REDIRECT_URI: 'https://app.finaxis.example/login',
        KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
        FINAXIS_API_URL: 'https://api.finaxis.example',
        REDIS_URL: undefined,
      }),
    ).rejects.toThrow(/REDIS_URL/);
  });

  it('accepts a valid REDIS_URL in production', async () => {
    const { serverEnv } = await loadEnvServerWith({
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://app.finaxis.example',
      AUTH_TRUSTED_ORIGINS: 'https://app.finaxis.example',
      AUTH_POST_LOGOUT_REDIRECT_URI: 'https://app.finaxis.example/login',
      KEYCLOAK_ISSUER: 'https://identity.finaxis.example/realms/finaxis',
      FINAXIS_API_URL: 'https://api.finaxis.example',
      REDIS_URL: 'redis://default:secret@redis:6379',
    });

    expect(serverEnv.REDIS_URL).toBe('redis://default:secret@redis:6379');
  });
});
