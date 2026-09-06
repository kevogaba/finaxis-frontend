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
  PLATFORM_ORGANISATION_ID: z.uuid(),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  AUTH_TRUSTED_ORIGINS: trustedOriginsSchema,
  AUTH_POST_LOGOUT_REDIRECT_URI: z.url(),
  FINAXIS_API_URL: z.url(),
  REDIS_URL: z.url().optional(),
  // Namespaces every key this app writes to Redis, so one Redis instance can safely
  // be shared across multiple apps/environments without key collisions. Override
  // per-environment (e.g. "finaxis-web-prod", "finaxis-web-staging") when doing so.
  REDIS_KEY_PREFIX: z.string().min(1).default('finaxis-web'),
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

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalOrigin(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Whether this process is running the standalone production build for local testing
 * rather than a real deployment.
 *
 * Next.js's standalone server (`.next/standalone/server.js`, used by both `pnpm
 * start` and the Dockerfile) hardcodes `NODE_ENV=production` unconditionally, so
 * there is no way to distinguish "running the production build locally" from a real
 * deployment via `NODE_ENV` alone. `FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS=1` is that
 * distinction — deliberately not part of `rawServerEnvSchema` (like
 * `FINAXIS_E2E_TEST_MODE` in auth/e2e-test-mode.ts, this is a local-only escape
 * hatch, not real production config, so it's read directly off `process.env` rather
 * than the validated schema). It relaxes two independent production requirements
 * that otherwise make it impossible to run this build locally at all:
 * `assertHttpsInProduction` below (paired with `isInsecureLocalOriginAllowed`'s own
 * per-origin scoping, so a real deployment's non-local origins still require HTTPS
 * regardless of this flag) and `assertRedisUrlInProduction` (no equivalent scoping
 * is possible there — REDIS_URL isn't a URL this app is served from — so a real
 * deployment stays safe only because nothing would ever set this flag there).
 */
function isLocalTestingModeEnabled(): boolean {
  return process.env.FINAXIS_ALLOW_INSECURE_LOCAL_ORIGINS === '1';
}

/**
 * Whether `url` is allowed to be plain HTTP despite `NODE_ENV=production`. Used both
 * by `assertHttpsInProduction` below and by `auth/auth.ts`'s `useSecureCookies` (a
 * `Secure` cookie is silently dropped by the browser over plain HTTP, which would
 * otherwise still block a real local sign-in even once the check below stops
 * throwing).
 */
export function isInsecureLocalOriginAllowed(url: string): boolean {
  return isLocalTestingModeEnabled() && isLocalOrigin(url);
}

function assertHttpsInProduction(env: ServerEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const candidates = [
    env.BETTER_AUTH_URL,
    env.AUTH_POST_LOGOUT_REDIRECT_URI,
    env.KEYCLOAK_ISSUER,
    env.FINAXIS_API_URL,
    ...env.AUTH_TRUSTED_ORIGINS,
  ];
  const insecure = candidates.find(
    (url) => !url.startsWith('https://') && !isInsecureLocalOriginAllowed(url),
  );
  if (insecure) {
    throw new Error(`Production requires HTTPS origins; got "${insecure}".`);
  }
}

function assertRedisUrlInProduction(env: ServerEnv): void {
  if (env.NODE_ENV === 'production' && !env.REDIS_URL && !isLocalTestingModeEnabled()) {
    throw new Error(
      "REDIS_URL is required in production — Better Auth's rate limiter needs a shared " +
        'store once more than one application instance may be running.',
    );
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
  assertRedisUrlInProduction(parsed.data);

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
