import 'server-only';
import { betterAuth } from 'better-auth';
import { genericOAuth, keycloak } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { serverEnv } from '@/config/env.server';
import { AUTH_COOKIE_PREFIX } from '@/auth/auth.types';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 8; // 8 hours — conservative for an enterprise finance system.

function createAuth() {
  return betterAuth({
    appName: 'Finaxis',
    baseURL: serverEnv.BETTER_AUTH_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    trustedOrigins: serverEnv.AUTH_TRUSTED_ORIGINS,

    // No `database` key: sessions are stateless, cached entirely in an
    // encrypted cookie. See docs/authentication/stateless-sessions.md for the
    // trade-offs (no central revocation short of a cookieCache version bump).
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
      useSecureCookies: serverEnv.NODE_ENV === 'production',
    },

    rateLimit: {
      enabled: serverEnv.NODE_ENV === 'production',
      window: 60,
      max: 30,
      customRules: {
        // Paths are relative to the /api/auth mount point.
        '/oauth2/callback/keycloak': { window: 60, max: 10 },
        '/sign-out': { window: 60, max: 10 },
      },
    },

    plugins: [
      genericOAuth({
        config: [
          // `keycloak()` sets `providerId: "keycloak"` internally and its
          // options type doesn't accept `providerId` or
          // `requireIssuerValidation` directly (see
          // node_modules/better-auth/dist/plugins/generic-oauth/providers/keycloak.d.mts).
          // Spread its returned GenericOAuthConfig and layer the stricter
          // issuer-validation flag on top.
          {
            ...keycloak({
              clientId: serverEnv.KEYCLOAK_CLIENT_ID,
              clientSecret: serverEnv.KEYCLOAK_CLIENT_SECRET,
              issuer: serverEnv.KEYCLOAK_ISSUER,
              scopes: ['openid', 'profile', 'email'],
              pkce: true,
            }),
            requireIssuerValidation: true,
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
    return Reflect.get(getAuth(), prop, receiver) as unknown;
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
