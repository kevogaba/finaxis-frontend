import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_SESSION_COOKIE_NAME,
  E2E_SESSION_COOKIE_VALUE,
  getE2eAccessToken,
  getE2eAuthenticatedUser,
} from './e2e-test-mode';

const authenticatedHeaders = () =>
  new Headers({
    cookie: `${E2E_SESSION_COOKIE_NAME}=${E2E_SESSION_COOKIE_VALUE}`,
  });

describe('E2E test mode security gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not activate in production', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getE2eAuthenticatedUser(authenticatedHeaders())).toBeNull();
    expect(getE2eAccessToken(authenticatedHeaders())).toBeNull();
  });

  it('activates only for the explicit non-production test mode', () => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'test');

    expect(getE2eAuthenticatedUser(authenticatedHeaders())).not.toBeNull();
    expect(getE2eAccessToken(authenticatedHeaders())).toBe('e2e-server-only-access-token');
  });
});
