import 'server-only';
import { betterAuth } from 'better-auth';
import { genericOAuth, keycloak } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { Redis } from 'ioredis';
import { isInsecureLocalOriginAllowed, serverEnv } from '@/config/env.server';
import { AUTH_COOKIE_PREFIX } from '@/auth/auth.types';
import { getE2eBetterAuthSession } from '@/auth/e2e-test-mode';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 8; // 8 hours — conservative for an enterprise finance system.

interface RateLimitRule {
  window: number;
  max: number;
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfter: number | null;
}

interface RateLimitStorage {
  consume: (key: string, rule: RateLimitRule) => Promise<RateLimitDecision>;
}

// Mirrors Better Auth's own built-in `secondaryStorage`-backed rate-limit algorithm
// (atomic increment-with-TTL, compared against `rule.max`) but deliberately does NOT
// go through the top-level `secondaryStorage` option — see the comment at its call
// site in createAuth() for why.
function createRedisRateLimitStorage(redis: Redis, keyPrefix: string): RateLimitStorage {
  async function consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const redisKey = `${keyPrefix}:better-auth:ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, rule.window * 1000);
    }
    if (count <= rule.max) {
      return { allowed: true, retryAfter: null };
    }
    return { allowed: false, retryAfter: rule.window };
  }

  return { consume };
}

function createAuth() {
  // Only configured when REDIS_URL is set (required in production, see
  // config/env.server.ts). Wired through `rateLimit.customStorage` rather than the
  // top-level `secondaryStorage` option deliberately: Better Auth treats any
  // configured `secondaryStorage` (or `database`) as "this deployment is stateful"
  // and silently disables `session.cookieCache.refreshCache` as a result
  // (`hasServerSessionStore` in its source checks exactly those two options) — which
  // would undermine the fully-stateless session design in
  // docs/authentication/stateless-sessions.md for a change that's only supposed to
  // affect rate-limit counters. `rateLimit.customStorage` has no such side effect.
  // Left undefined in development/test, where rate limiting is disabled anyway and
  // no local Redis is expected.
  const redisRateLimitStorage = serverEnv.REDIS_URL
    ? createRedisRateLimitStorage(new Redis(serverEnv.REDIS_URL), serverEnv.REDIS_KEY_PREFIX)
    : undefined;

  return betterAuth({
    appName: 'Finaxis',
    baseURL: serverEnv.BETTER_AUTH_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    trustedOrigins: serverEnv.AUTH_TRUSTED_ORIGINS,

    // No `database` key, and no `secondaryStorage` either: sessions are stateless,
    // cached entirely in an encrypted cookie. See docs/authentication/stateless-sessions.md
    // for the trade-offs (no central revocation short of a cookieCache version bump).
    session: {
      expiresIn: SESSION_LIFETIME_SECONDS,
      cookieCache: {
        enabled: true,
        strategy: 'jwe',
        maxAge: SESSION_LIFETIME_SECONDS,
        refreshCache: true,
        version: '1',
      },
    },

    account: {
      storeStateStrategy: 'cookie',
      storeAccountCookie: true,
      encryptOAuthTokens: true,
    },

    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies:
        serverEnv.NODE_ENV === 'production' &&
        !isInsecureLocalOriginAllowed(serverEnv.BETTER_AUTH_URL),
    },

    rateLimit: {
      enabled: serverEnv.NODE_ENV === 'production',
      // `storage` is ignored once `customStorage` is set; leaving it unset falls
      // back to the default in-memory store when Redis isn't configured.
      customStorage: redisRateLimitStorage,
      window: 60,
      max: 30,
      customRules: {
        // Paths are relative to the /api/auth mount point. Keycloak is registered as a
        // first-class social provider (see the generic-oauth plugin below), so its callback
        // is the core `/callback/:id` route, not a generic-oauth-specific path.
        '/callback/keycloak': { window: 60, max: 10 },
        '/sign-out': { window: 60, max: 10 },
      },
    },

    plugins: [
      genericOAuth({
        config: [
          // `keycloak()` sets `providerId: "keycloak"` internally and its options type
          // doesn't accept `requireIdTokenVerification` directly (see
          // node_modules/better-auth/dist/plugins/generic-oauth/providers/keycloak.d.mts,
          // whose `KeycloakOptions` only picks a handful of fields from the full
          // `GenericOAuthConfig`). Spread its returned config and layer the stricter
          // verification flag on top: with `issuer` set, Better Auth always discovers
          // and uses the issuer for this provider (there's no longer a separate opt-in
          // for that), but ID-token verification against the discovery document's JWKS
          // still silently downgrades to unverified decoding if discovery doesn't
          // provide it, unless this flag is set — fail startup instead of downgrading.
          {
            ...keycloak({
              clientId: serverEnv.KEYCLOAK_CLIENT_ID,
              clientSecret: serverEnv.KEYCLOAK_CLIENT_SECRET,
              issuer: serverEnv.KEYCLOAK_ISSUER,
              scopes: ['openid', 'profile', 'email'],
              pkce: true,
            }),
            requireIdTokenVerification: true,
          },
        ],
      }),
      // Must be last: lets auth.api.* calls (e.g. the custom logout route in
      // Task 23) set/clear cookies via next/headers when called outside
      // toNextJsHandler's own request/response cycle.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let memoizedAuth: Auth | undefined;

function getAuth(): Auth {
  memoizedAuth ??= createAuth();
  return memoizedAuth;
}

interface HeadersContext {
  headers: Headers;
}

type GetSessionEndpoint = (context: HeadersContext) => Promise<unknown>;

function apiWithE2eSession(api: unknown): unknown {
  if (typeof api !== 'object' || api === null) {
    return api;
  }

  return new Proxy(api, {
    get(target, prop, receiver): unknown {
      const value: unknown = Reflect.get(target, prop, receiver) as unknown;
      if (prop !== 'getSession' || typeof value !== 'function') {
        return value;
      }

      return async (context: HeadersContext): Promise<unknown> => {
        const e2eSession = getE2eBetterAuthSession(context.headers);
        if (e2eSession) {
          return e2eSession;
        }

        return (value as GetSessionEndpoint)(context);
      };
    },
  });
}

/**
 * Lazily-constructed Better Auth instance.
 *
 * `createAuth()` reads `serverEnv` (itself lazily validated — see
 * `config/env.server.ts`) while building the Better Auth config object, so constructing it
 * eagerly at module scope would trigger environment validation the instant this module is
 * imported. `next build` sets `NODE_ENV=production` internally and imports this module
 * transitively (via the `/api/auth/*` route handlers) during "Collecting page data", which would
 * otherwise fail a plain local dev build against `.env.local`'s http:// values. Wrapping the
 * instance in a Proxy defers `createAuth()` to the first actual property access (real
 * request-handling time), while every existing call site (`auth.api.getSession(...)`,
 * `auth.handler(...)`, etc.) keeps working unchanged via normal property access.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver): unknown {
    const value = Reflect.get(getAuth(), prop, receiver) as unknown;
    return prop === 'api' ? apiWithE2eSession(value) : value;
  },
  has(_target, prop) {
    return Reflect.has(getAuth(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(getAuth());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getAuth(), prop);
  },
});
