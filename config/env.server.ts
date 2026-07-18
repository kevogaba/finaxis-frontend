import 'server-only';
import { z } from 'zod';

const trustedOriginsSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.url()).min(1, 'At least one trusted origin is required.'));

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.'),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  AUTH_TRUSTED_ORIGINS: trustedOriginsSchema,
  AUTH_POST_LOGOUT_REDIRECT_URI: z.url(),
});

export type ServerEnv = z.infer<typeof rawServerEnvSchema>;

function originOf(url: string): string {
  return new URL(url).origin;
}

function assertNoWildcardOrigins(origins: readonly string[]): void {
  const wildcard = origins.find((origin) => origin.includes('*'));
  if (wildcard) {
    throw new Error(`AUTH_TRUSTED_ORIGINS must not contain wildcard origins; got "${wildcard}".`);
  }
}

function assertHttpsInProduction(env: ServerEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const candidates = [
    env.BETTER_AUTH_URL,
    env.AUTH_POST_LOGOUT_REDIRECT_URI,
    env.KEYCLOAK_ISSUER,
    ...env.AUTH_TRUSTED_ORIGINS,
  ];
  const insecure = candidates.find((url) => !url.startsWith('https://'));
  if (insecure) {
    throw new Error(`Production requires HTTPS origins; got "${insecure}".`);
  }
}

function assertPostLogoutRedirectIsTrusted(env: ServerEnv): void {
  const trustedOrigins = new Set([
    originOf(env.BETTER_AUTH_URL),
    ...env.AUTH_TRUSTED_ORIGINS.map(originOf),
  ]);
  const postLogoutOrigin = originOf(env.AUTH_POST_LOGOUT_REDIRECT_URI);
  if (!trustedOrigins.has(postLogoutOrigin)) {
    throw new Error(
      `AUTH_POST_LOGOUT_REDIRECT_URI (${postLogoutOrigin}) must belong to a trusted origin.`,
    );
  }
}

function parseServerEnv(): ServerEnv {
  const parsed = rawServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration: ${parsed.error.message}`);
  }

  assertNoWildcardOrigins(parsed.data.AUTH_TRUSTED_ORIGINS);
  assertHttpsInProduction(parsed.data);
  assertPostLogoutRedirectIsTrusted(parsed.data);

  return parsed.data;
}

let memoizedServerEnv: ServerEnv | undefined;

function getServerEnv(): ServerEnv {
  memoizedServerEnv ??= parseServerEnv();
  return memoizedServerEnv;
}

/**
 * Lazily-validated server environment.
 *
 * `parseServerEnv()` (and its HTTPS-in-production / trusted-origin checks) runs on first
 * property access rather than at module-import time. This matters because `next build` sets
 * `NODE_ENV=production` internally and imports route modules during "Collecting page data",
 * which would otherwise trigger production validation against local/dev `.env` values during a
 * plain local build. Every call site keeps using normal property access (e.g.
 * `serverEnv.BETTER_AUTH_URL`) unchanged — the Proxy's `get` trap computes and caches the real
 * config on first read.
 */
export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop, receiver): unknown {
    return Reflect.get(getServerEnv(), prop, receiver) as unknown;
  },
  has(_target, prop) {
    return Reflect.has(getServerEnv(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(getServerEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getServerEnv(), prop);
  },
});
