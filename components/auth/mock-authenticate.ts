export interface MockCredentials {
  identifier: string;
  password: string;
}

export type MockAuthResult = { status: 'success' } | { status: 'error'; message: string };

/**
 * Demo-only credential the login form treats as an existing but access-restricted
 * account, to exercise the generic-error path without implying real accounts exist.
 */
const LOCKED_DEMO_IDENTIFIER = 'locked@finaxis.test';

/**
 * Placeholder for the future identity-provider integration (e.g. Keycloak).
 * Never persists credentials, never logs input, never issues a network request —
 * isolated here so swapping in a real auth call only touches this module.
 */
export async function mockAuthenticate({ identifier }: MockCredentials): Promise<MockAuthResult> {
  await new Promise((resolve) => {
    setTimeout(resolve, 500);
  });

  if (identifier.trim().toLowerCase() === LOCKED_DEMO_IDENTIFIER) {
    return {
      status: 'error',
      message: 'We could not sign you in with those details. Check your credentials and try again.',
    };
  }

  return { status: 'success' };
}
