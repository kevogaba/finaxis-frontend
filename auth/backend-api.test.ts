import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken, serverEnv } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  serverEnv: {
    BETTER_AUTH_URL: 'https://app.finaxis.test',
    FINAXIS_API_URL: 'https://api.finaxis.test/',
  },
}));

vi.mock('@/auth/auth', () => ({ auth: { api: { getAccessToken } } }));
vi.mock('@/config/env.server', () => ({ serverEnv }));

const { BackendApiError, backendApi, getKeycloakAccessToken } = await import('./backend-api');

describe('backendApi', () => {
  const requestHeaders = new Headers({ cookie: 'finaxis.session_token=session-value' });
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getAccessToken.mockResolvedValue({ accessToken: 'keycloak-access-token' });
  });

  it('gets the Keycloak token server-side with a trusted origin for server-rendered requests', async () => {
    await expect(getKeycloakAccessToken(requestHeaders)).resolves.toBe('keycloak-access-token');

    const expectedHeaders = new Headers(requestHeaders);
    expectedHeaders.set('origin', 'https://app.finaxis.test');
    expect(getAccessToken).toHaveBeenCalledWith({
      headers: expectedHeaders,
      body: { useAccountCookie: true },
    });
  });

  it('preserves an existing request origin', async () => {
    const headers = new Headers({
      cookie: 'finaxis.session_token=session-value',
      origin: 'https://app.finaxis.test',
    });

    await expect(getKeycloakAccessToken(headers)).resolves.toBe('keycloak-access-token');

    expect(getAccessToken.mock.calls[0]?.[0].headers.get('origin')).toBe(
      'https://app.finaxis.test',
    );
  });

  it('adds bearer authentication and avoids a double slash for GET requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await expect(
      backendApi.get<{ items: unknown[] }>('/api/v1/auth/organisations', requestHeaders),
    ).resolves.toEqual({
      items: [],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.finaxis.test/api/v1/auth/organisations');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer keycloak-access-token');
  });

  it('adds the active organisation context header when supplied', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await backendApi.get('/api/v1/auth/branches?page=0&size=25', requestHeaders, 'signed-context');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('X-Active-Organisation-Context')).toBe('signed-context');
  });

  it('sends JSON and a fresh UUID idempotency key for POST requests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ context_token: 'signed-context' }), { status: 200 }),
    );

    await backendApi.post(
      '/api/v1/auth/select-organisation',
      { organisation_id: '123' },
      requestHeaders,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(init.body).toBe(JSON.stringify({ organisation_id: '123' }));
  });

  it('forwards a caller-supplied idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const key = '0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

    await backendApi.post('/api/v1/tenant/business-date/cob/start', {}, requestHeaders, 'ctx', key);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(key);
  });

  it('sends JSON and a caller-supplied idempotency key for PUT requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const key = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

    await backendApi.put(
      '/api/v1/tenant/business-date',
      { new_business_date: '08-09-2026' },
      requestHeaders,
      'ctx',
      key,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ new_business_date: '08-09-2026' }));
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toBe(key);
  });

  it('sends JSON and a caller-supplied idempotency key for PATCH requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const key = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

    await backendApi.patch(
      '/api/v1/tenant/business-date',
      { reason: 'fix' },
      requestHeaders,
      'ctx',
      key,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ reason: 'fix' }));
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toBe(key);
  });

  it('sends a JSON body and Content-Type for DELETE requests with a body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const key = '3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a';

    await backendApi.delete('/api/v1/tenant/business-date/history/1', requestHeaders, 'ctx', key, {
      reason: 'cleanup',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(JSON.stringify({ reason: 'cleanup' }));
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toBe(key);
  });

  it('sends no body and no Content-Type for DELETE requests without a body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const key = '4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b';

    await backendApi.delete('/api/v1/tenant/business-date/history/1', requestHeaders, 'ctx', key);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('Idempotency-Key')).toBe(key);
  });

  it.each([
    ['get', () => backendApi.get('/api/v1/tenant/business-date', requestHeaders)],
    ['post', () => backendApi.post('/api/v1/tenant/business-date/cob/start', {}, requestHeaders)],
    ['put', () => backendApi.put('/api/v1/tenant/business-date', {}, requestHeaders)],
    ['patch', () => backendApi.patch('/api/v1/tenant/business-date', {}, requestHeaders)],
    ['delete', () => backendApi.delete('/api/v1/tenant/business-date/history/1', requestHeaders)],
  ])('%s resolves a 204 response to undefined before any JSON parse', async (_method, call) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(call()).resolves.toBeUndefined();
  });

  it('exposes the safe problem code and request id from problem+json errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'urn:finaxis:problem:invalid_active_tenant_context',
          title: 'Forbidden',
          status: 403,
          detail: 'The active organisation context is invalid.',
          instance: '/api/v1/auth/me',
          code: 'invalid_active_tenant_context',
          request_id: 'req-123',
          violations: null,
        }),
        { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    );

    const error = await backendApi.get('/api/v1/auth/me', requestHeaders).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BackendApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'invalid_active_tenant_context',
      requestId: 'req-123',
    });
  });

  it('prefers the body request_id over the X-Request-Id response header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'internal_error', request_id: 'req-body' }), {
        status: 500,
        headers: { 'x-request-id': 'req-from-header' },
      }),
    );

    const error = await backendApi.get('/api/v1/auth/me', requestHeaders).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500, code: 'internal_error', requestId: 'req-body' });
  });

  it('falls back to the X-Request-Id header when the problem body has no request_id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'internal_error' }), {
        status: 500,
        headers: { 'x-request-id': 'req-from-header' },
      }),
    );

    const error = await backendApi.get('/api/v1/auth/me', requestHeaders).catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 500,
      code: 'internal_error',
      requestId: 'req-from-header',
    });
  });

  it('falls back to the X-Request-Id header for a non-object problem body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify('oops'), {
        status: 500,
        headers: { 'x-request-id': 'req-from-header' },
      }),
    );

    const error = await backendApi.get('/api/v1/auth/me', requestHeaders).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500, code: null, requestId: 'req-from-header' });
  });

  it('tolerates an empty error body (invalid JWT) and non-JSON errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));

    const error = await backendApi.get('/api/v1/auth/me', requestHeaders).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, code: null, requestId: null });
  });

  it('returns only safe problem metadata for non-success responses', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Membership for Acme is inactive.' }), { status: 403 }),
    );

    const error = await backendApi
      .get('/api/v1/auth/organisations', requestHeaders)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BackendApiError);
    expect(error).toMatchObject({
      status: 403,
      problem: { status: 403, title: 'Platform API request failed.' },
    });
    expect(String(error)).not.toContain('Membership for Acme');
  });

  it('normalizes Better Auth token failures without exposing their messages', async () => {
    getAccessToken.mockRejectedValueOnce(new Error('Keycloak token: sensitive-access-token'));

    const error = await backendApi
      .get('/api/v1/auth/organisations', requestHeaders)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 401,
      problem: { status: 401, title: 'Platform API request failed.' },
    });
    expect(error).toBeInstanceOf(BackendApiError);
    expect(String(error)).not.toContain('sensitive-access-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes backend network failures without exposing their messages', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection to api failed: backend-secret'));

    const error = await backendApi
      .get('/api/v1/auth/organisations', requestHeaders)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 502,
      problem: { status: 502, title: 'Platform API request failed.' },
    });
    expect(error).toBeInstanceOf(BackendApiError);
    expect(String(error)).not.toContain('backend-secret');
  });

  it('normalizes invalid successful backend JSON without exposing its body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"access_token":"backend-response-secret"', { status: 200 }),
    );

    const error = await backendApi
      .get('/api/v1/auth/organisations', requestHeaders)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 502,
      problem: { status: 502, title: 'Platform API request failed.' },
    });
    expect(error).toBeInstanceOf(BackendApiError);
    expect(String(error)).not.toContain('backend-response-secret');
  });

  it('normalizes empty successful backend JSON responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    await expect(
      backendApi.get('/api/v1/auth/organisations', requestHeaders),
    ).rejects.toMatchObject({
      status: 502,
      problem: { status: 502, title: 'Platform API request failed.' },
    });
  });
});
