import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_RUN_COOKIE_NAME,
  E2E_SESSION_COOKIE_NAME,
  E2E_SESSION_COOKIE_VALUE,
  getE2eAccessToken,
  getE2eAuthenticatedUser,
  getE2eBetterAuthSession,
} from './e2e-test-mode';

function headersWith(cookies: Record<string, string>) {
  return new Headers({
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
  });
}

const session = { [E2E_SESSION_COOKIE_NAME]: E2E_SESSION_COOKIE_VALUE };

describe('e2e test mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is inert unless FINAXIS_E2E_TEST_MODE=1 outside production', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
    expect(getE2eAccessToken(headersWith(session))).toBeNull();
    expect(getE2eBetterAuthSession(headersWith(session))).toBeNull();
  });

  it('requires the e2e session cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAccessToken(new Headers())).toBeNull();
    expect(getE2eAuthenticatedUser(new Headers())).toBeNull();
  });

  it('derives the fake-API bearer token from the run cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(
      getE2eAccessToken(
        headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'platform-operator.run-1' }),
      ),
    ).toBe('e2e.platform-operator.run-1');
  });

  it('falls back to the shared default run for a missing or malformed run cookie', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAccessToken(headersWith(session))).toBe('e2e.default.shared');
    expect(getE2eAccessToken(headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'x;y' }))).toBe(
      'e2e.default.shared',
    );
  });

  it('provides a Better Auth-shaped session and a sanitized user', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eBetterAuthSession(headersWith(session))?.session.token).toBe(
      E2E_SESSION_COOKIE_VALUE,
    );
    expect(getE2eAuthenticatedUser(headersWith(session))).toMatchObject({
      email: 'e2e.session@greenfield.example',
      permissions: [],
    });
  });
});
