import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_SESSION_COOKIE_NAME,
  E2E_SESSION_COOKIE_VALUE,
  getE2eAccessToken,
  getE2eAuthenticatedUser,
  getE2eBackendResult,
} from './e2e-test-mode';

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

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

describe('getE2eBackendResult platform administration fixtures', () => {
  beforeEach(() => {
    vi.stubEnv('FINAXIS_E2E_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function branchContextToken(): string {
    const orgSelection = getE2eBackendResult<{ context_token: string }>(
      '/api/v1/auth/select-organisation',
      authenticatedHeaders(),
      { method: 'POST' },
    );
    if (orgSelection.kind !== 'success') {
      throw new Error('Expected organisation selection to succeed.');
    }

    const branchSelection = getE2eBackendResult<{ context_token: string }>(
      '/api/v1/auth/select-branch',
      authenticatedHeaders(),
      { method: 'POST' },
      orgSelection.body.context_token,
    );
    if (branchSelection.kind !== 'success') {
      throw new Error('Expected branch selection to succeed.');
    }

    return branchSelection.body.context_token;
  }

  it('is unhandled outside e2e test mode or without a session', () => {
    vi.unstubAllEnvs();

    expect(getE2eBackendResult('/api/v1/platform/tenants', authenticatedHeaders(), {})).toEqual({
      kind: 'unhandled',
    });
    expect(getE2eBackendResult('/api/v1/platform/tenants', new Headers(), {})).toEqual({
      kind: 'unhandled',
    });
  });

  it('is unhandled for a path it does not recognize', () => {
    expect(
      getE2eBackendResult('/api/v1/unknown', authenticatedHeaders(), {}, branchContextToken()),
    ).toEqual({ kind: 'unhandled' });
  });

  it('lists tenants only for the branch context token', () => {
    const forbidden = getE2eBackendResult<{ items: unknown[] }>(
      '/api/v1/platform/tenants',
      authenticatedHeaders(),
      {},
    );
    expect(forbidden).toEqual({ kind: 'error', status: 403 });

    const result = getE2eBackendResult<{ items: readonly { id: string }[] }>(
      '/api/v1/platform/tenants?page=0',
      authenticatedHeaders(),
      {},
      branchContextToken(),
    );
    expect(result.kind).toBe('success');
    expect(result.kind === 'success' && result.body.items[0]?.id).toBe(PLATFORM_TENANT_ID);
  });

  it('returns tenant detail for a known id and 404 for an unknown id', () => {
    const contextToken = branchContextToken();

    const found = getE2eBackendResult<{ id: string }>(
      `/api/v1/platform/tenants/${PLATFORM_TENANT_ID}`,
      authenticatedHeaders(),
      {},
      contextToken,
    );
    expect(found.kind).toBe('success');
    expect(found.kind === 'success' && found.body.id).toBe(PLATFORM_TENANT_ID);

    const missing = getE2eBackendResult(
      '/api/v1/platform/tenants/00000000-0000-4000-8000-000000000000',
      authenticatedHeaders(),
      {},
      contextToken,
    );
    expect(missing).toEqual({ kind: 'error', status: 404 });

    const forbidden = getE2eBackendResult(
      `/api/v1/platform/tenants/${PLATFORM_TENANT_ID}`,
      authenticatedHeaders(),
      {},
    );
    expect(forbidden).toEqual({ kind: 'error', status: 403 });
  });

  it('lists audit events only for the branch context token', () => {
    const forbidden = getE2eBackendResult(
      '/api/v1/tenant/audit-events',
      authenticatedHeaders(),
      {},
    );
    expect(forbidden).toEqual({ kind: 'error', status: 403 });

    const result = getE2eBackendResult<{ items: readonly { entity_type: string }[] }>(
      '/api/v1/tenant/audit-events?page=0',
      authenticatedHeaders(),
      {},
      branchContextToken(),
    );
    expect(result.kind).toBe('success');
    expect(result.kind === 'success' && result.body.items[0]?.entity_type).toBe('TENANT');
  });
});
