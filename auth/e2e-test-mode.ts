import 'server-only';
import type { FinaxisUser } from '@/auth/auth.types';

export const E2E_SESSION_COOKIE_NAME = 'finaxis.session_token';
export const E2E_SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
/**
 * Names the fake-API run for this browser context: `<scenario>.<run id>`. The fake API
 * (e2e/fake-api) seeds an isolated backend per bearer token derived from it.
 */
export const E2E_RUN_COOKIE_NAME = 'finaxis_e2e_run';

const DEFAULT_RUN = 'default.shared';
const RUN_PATTERN = /^[a-z0-9-]+\.[A-Za-z0-9-]+$/;

export interface E2eBetterAuthSession {
  session: {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    token: string;
    updatedAt: Date;
    userId: string;
  };
  user: {
    createdAt: Date;
    email: string;
    emailVerified: boolean;
    id: string;
    image: string | null;
    name: string;
    updatedAt: Date;
  };
}

function isE2eTestMode(): boolean {
  return process.env.FINAXIS_E2E_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
}

function cookieValue(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => {
      const separator = value.indexOf('=');
      return separator > 0 && value.slice(0, separator) === name;
    });

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  } catch {
    return null;
  }
}

function hasE2eSession(headers: Headers): boolean {
  return cookieValue(headers, E2E_SESSION_COOKIE_NAME) === E2E_SESSION_COOKIE_VALUE;
}

export function getE2eAuthenticatedUser(headers: Headers): FinaxisUser | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  return {
    branches: [],
    email: 'e2e.session@greenfield.example',
    id: 'e2e-session-user',
    name: 'E2E Session User',
    permissions: [],
    roles: [],
  };
}

/** Bearer token sent to the fake API; never a real Keycloak token. */
export function getE2eAccessToken(headers: Headers): string | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  const run = cookieValue(headers, E2E_RUN_COOKIE_NAME);
  return `e2e.${run !== null && RUN_PATTERN.test(run) ? run : DEFAULT_RUN}`;
}

export function getE2eBetterAuthSession(headers: Headers): E2eBetterAuthSession | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  const createdAt = new Date('2026-07-26T00:00:00.000Z');
  const expiresAt = new Date('2026-07-26T08:00:00.000Z');

  return {
    session: {
      createdAt,
      expiresAt,
      id: 'e2e-session-id',
      token: E2E_SESSION_COOKIE_VALUE,
      updatedAt: createdAt,
      userId: 'e2e-session-user',
    },
    user: {
      createdAt,
      email: 'e2e.session@greenfield.example',
      emailVerified: true,
      id: 'e2e-session-user',
      image: null,
      name: 'E2E Session User',
      updatedAt: createdAt,
    },
  };
}
