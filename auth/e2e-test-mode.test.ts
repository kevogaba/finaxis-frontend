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

  it.each([undefined, '0'])(
    'is inert by default: an unset or non-"1" flag (%s) stays off even outside production',
    (flagValue) => {
      vi.stubEnv('FINAXIS_E2E_TEST_MODE', flagValue);
      vi.stubEnv('NODE_ENV', 'test');

      expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
      expect(getE2eAccessToken(headersWith(session))).toBeNull();
      expect(getE2eBetterAuthSession(headersWith(session))).toBeNull();
    },
  );

  it('stays inert in a production build without the e2e build switch, even with the runtime flag', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FINAXIS_E2E_BUILD', '');

    expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
    expect(getE2eAccessToken(headersWith(session))).toBeNull();
    expect(getE2eBetterAuthSession(headersWith(session))).toBeNull();
  });

  it('turns on in the e2e production build only with the runtime flag too', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FINAXIS_E2E_BUILD', '1');
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAuthenticatedUser(headersWith(session))?.id).toBe('e2e-session-user');
    expect(
      getE2eAccessToken(headersWith({ ...session, [E2E_RUN_COOKIE_NAME]: 'default.abc' })),
    ).toBe('e2e.default.abc');

    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '0');
    expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
  });

  it.each(['true', 'yes', ' 1'])('treats a non-"1" build switch (%j) as off', (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FINAXIS_E2E_BUILD', value);
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');

    expect(getE2eAuthenticatedUser(headersWith(session))).toBeNull();
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
