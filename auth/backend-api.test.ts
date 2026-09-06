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
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      backendApi.get('/api/v1/auth/organisations', requestHeaders),
    ).rejects.toMatchObject({
      status: 502,
      problem: { status: 502, title: 'Platform API request failed.' },
    });
  });
});
