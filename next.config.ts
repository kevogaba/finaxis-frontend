import type { NextConfig } from 'next';

interface CspEnv {
  KEYCLOAK_ISSUER?: string;
  NODE_ENV?: string;
}

// The sign-out flow (components/shell/user-menu.tsx) submits a real HTML
// <form> to /api/auth/logout, which 303-redirects the top-level navigation
// on to Keycloak's RP-initiated logout endpoint before Keycloak redirects
// back. Chromium enforces `form-action` against every hop of that redirect
// chain, not just the form's own same-origin `action` attribute — so
// `form-action 'self'` alone silently blocks the entire logout navigation
// ("Sending form data ... violates ... form-action 'self'" in devtools, with
// no server-side error at all). The Keycloak issuer's origin must be
// explicitly allowlisted here for logout to work in a real browser.
export function keycloakOrigin(env: CspEnv = process.env): string | null {
  const issuer = env.KEYCLOAK_ISSUER;
  if (!issuer) {
    if (env.NODE_ENV === 'test') {
      return null;
    }
    throw new Error('KEYCLOAK_ISSUER is required to emit the Content-Security-Policy header.');
  }

  try {
    return new URL(issuer).origin;
  } catch {
    throw new Error(
      'KEYCLOAK_ISSUER must be a valid URL to emit the Content-Security-Policy header.',
    );
  }
}

// Two narrow, documented 'unsafe-inline' carve-outs, each scoped to a single
// directive rather than a blanket relaxation:
// - style-src: Emotion (MUI's styling engine, via AppRouterCacheProvider)
//   injects <style> tags without a CSP nonce in this setup.
// - script-src: Next.js's own inline hydration/RSC bootstrap script is
//   un-nonced here too. The stricter alternative (per-request nonces) would
//   require dynamic rendering everywhere plus MUI/Emotion nonce integration,
//   which this app deliberately does not adopt. See
//   docs/authentication/security.md for the full CSP rationale.
export function createContentSecurityPolicy(env: CspEnv = process.env): string {
  const formActionOrigins = ["'self'", keycloakOrigin(env)].filter(
    (origin): origin is string => origin !== null,
  );
  const unsafeEval = env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${unsafeEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `form-action ${formActionOrigins.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ');
}

interface SecurityHeader {
  key: string;
  value: string;
}

export function createSecurityHeaders(env: CspEnv = process.env): SecurityHeader[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: createContentSecurityPolicy(env) },
    ...(env.NODE_ENV === 'production'
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
      : []),
  ];
}

interface NextConfigEnv extends CspEnv {
  FINAXIS_E2E_BUILD?: string;
}

// `FINAXIS_E2E_BUILD=1` at build time (`pnpm build:e2e`) makes the e2e flavour of the production
// build, the only build in which auth/e2e-test-mode.ts's session bypass can turn on: the switch is
// inlined into server code here, so a normal build carries an empty string literal that no runtime
// environment can change. `defineServer`, not `define`: the switch never reaches client bundles,
// and Next serialises the raw value itself. The e2e build also gets its own directory, so it can
// never overwrite or stand in for `.next`, the only directory `pnpm start`, the Dockerfile and the
// Release workflow read.
export function createNextConfig(env: NextConfigEnv): NextConfig {
  const isE2eBuild = env.FINAXIS_E2E_BUILD === '1';

  return {
    output: 'standalone',
    distDir: isE2eBuild ? '.next-e2e' : '.next',
    compiler: {
      defineServer: { 'process.env.FINAXIS_E2E_BUILD': isE2eBuild ? '1' : '' },
    },
    headers() {
      return [
        {
          source: '/:path*',
          headers: createSecurityHeaders(env),
        },
      ];
    },
    redirects() {
      return [
        {
          source: '/',
          destination: '/login',
          permanent: false,
        },
      ];
    },
  };
}

export default createNextConfig(process.env);
