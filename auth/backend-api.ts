import 'server-only';
import { auth } from '@/auth/auth';
import { serverEnv } from '@/config/env.server';
import { getE2eAccessToken } from '@/auth/e2e-test-mode';

const CONTEXT_HEADER = 'X-Active-Organisation-Context';
const UNAUTHENTICATED_STATUS = 401;
const UPSTREAM_FAILURE_STATUS = 502;

export interface SafeBackendProblem {
  status: number;
  title: string;
}

export class BackendApiError extends Error {
  readonly problem: SafeBackendProblem;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    readonly status: number,
    details: { code?: string | null; requestId?: string | null } = {},
  ) {
    super(`Platform API request failed with status ${status}.`);
    this.name = 'BackendApiError';
    this.problem = { status, title: 'Platform API request failed.' };
    this.code = details.code ?? null;
    this.requestId = details.requestId ?? null;
  }
}

function toBackendApiError(status: number): BackendApiError {
  return new BackendApiError(status);
}

/** Reads only the safe, stable fields of a problem+json body; anything else is ignored. */
async function problemDetails(
  response: Response,
): Promise<{ code: string | null; requestId: string | null }> {
  // Falls back to the response header whenever the body itself doesn't carry a request id —
  // a non-object body, an object body missing `request_id`, or one that fails to parse at all.
  const headerRequestId = response.headers.get('x-request-id');
  try {
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) {
      return { code: null, requestId: headerRequestId };
    }
    const code = 'code' in body && typeof body.code === 'string' ? body.code : null;
    const requestId =
      'request_id' in body && typeof body.request_id === 'string'
        ? body.request_id
        : headerRequestId;
    return { code, requestId };
  } catch {
    return { code: null, requestId: headerRequestId };
  }
}

function backendUrl(path: string): string {
  return `${serverEnv.FINAXIS_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function getKeycloakAccessToken(headers: Headers): Promise<string> {
  const e2eAccessToken = getE2eAccessToken(headers);
  if (e2eAccessToken) {
    return e2eAccessToken;
  }

  try {
    const authHeaders = new Headers(headers);
    if (!authHeaders.has('origin')) {
      authHeaders.set('origin', serverEnv.BETTER_AUTH_URL);
    }

    // `useAccountCookie` reads the signed account cookie Better Auth already sets on
    // sign-in (`account.storeAccountCookie: true` in auth/auth.ts) — replaces the old
    // `providerId`-keyed lookup, since accounts are no longer looked up by provider id.
    const token = await auth.api.getAccessToken({
      headers: authHeaders,
      body: { useAccountCookie: true },
    });

    if (typeof token.accessToken !== 'string' || token.accessToken.length === 0) {
      throw toBackendApiError(UNAUTHENTICATED_STATUS);
    }

    return token.accessToken;
  } catch (error) {
    if (error instanceof BackendApiError) {
      throw error;
    }

    throw toBackendApiError(UNAUTHENTICATED_STATUS);
  }
}

async function request<T>(
  path: string,
  headers: Headers,
  init: RequestInit,
  contextToken?: string,
): Promise<T> {
  const accessToken = await getKeycloakAccessToken(headers);
  const backendHeaders = new Headers(init.headers);
  backendHeaders.set('Authorization', `Bearer ${accessToken}`);
  if (contextToken) {
    backendHeaders.set(CONTEXT_HEADER, contextToken);
  }

  let response: Response;
  try {
    response = await fetch(backendUrl(path), {
      ...init,
      cache: 'no-store',
      headers: backendHeaders,
    });
  } catch {
    throw toBackendApiError(UPSTREAM_FAILURE_STATUS);
  }
  if (!response.ok) {
    throw new BackendApiError(response.status, await problemDetails(response));
  }

  if (response.status === 204) {
    // No body to parse, and none of our routes rely on a 204's (nonexistent) payload.
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw toBackendApiError(UPSTREAM_FAILURE_STATUS);
  }
}

function jsonBodyInit(
  method: string,
  body: Record<string, unknown> | undefined,
  idempotencyKey: string,
): RequestInit {
  const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
  if (body === undefined) {
    return { method, headers };
  }
  headers['Content-Type'] = 'application/json';
  return { method, headers, body: JSON.stringify(body) };
}

export const backendApi = {
  get<T>(path: string, headers: Headers, contextToken?: string): Promise<T> {
    return request<T>(path, headers, { method: 'GET' }, contextToken);
  },

  post<T>(
    path: string,
    body: Record<string, unknown>,
    headers: Headers,
    contextToken?: string,
    // Server Actions pass the key the form minted when it opened (spec §6.4) so a retry replays.
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<T> {
    return request<T>(path, headers, jsonBodyInit('POST', body, idempotencyKey), contextToken);
  },

  put<T>(
    path: string,
    body: Record<string, unknown>,
    headers: Headers,
    contextToken?: string,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<T> {
    return request<T>(path, headers, jsonBodyInit('PUT', body, idempotencyKey), contextToken);
  },

  patch<T>(
    path: string,
    body: Record<string, unknown>,
    headers: Headers,
    contextToken?: string,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<T> {
    return request<T>(path, headers, jsonBodyInit('PATCH', body, idempotencyKey), contextToken);
  },

  delete<T>(
    path: string,
    headers: Headers,
    contextToken?: string,
    idempotencyKey: string = crypto.randomUUID(),
    body?: Record<string, unknown>,
  ): Promise<T> {
    return request<T>(path, headers, jsonBodyInit('DELETE', body, idempotencyKey), contextToken);
  },
};
