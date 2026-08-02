import 'server-only';
import { auth } from '@/auth/auth';
import { serverEnv } from '@/config/env.server';
import { getE2eAccessToken, getE2eBackendResult } from '@/auth/e2e-test-mode';

const CONTEXT_HEADER = 'X-Active-Organisation-Context';
const UNAUTHENTICATED_STATUS = 401;
const UPSTREAM_FAILURE_STATUS = 502;

export interface SafeBackendProblem {
  status: number;
  title: string;
}

export class BackendApiError extends Error {
  readonly problem: SafeBackendProblem;

  constructor(readonly status: number) {
    super(`Platform API request failed with status ${status}.`);
    this.name = 'BackendApiError';
    this.problem = { status, title: 'Platform API request failed.' };
  }
}

function toBackendApiError(status: number): BackendApiError {
  return new BackendApiError(status);
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

    const token = await auth.api.getAccessToken({
      headers: authHeaders,
      body: { providerId: 'keycloak' },
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
  const e2eResult = getE2eBackendResult<T>(path, headers, init, contextToken);
  if (e2eResult.kind === 'success') {
    return e2eResult.body;
  }
  if (e2eResult.kind === 'error') {
    throw new BackendApiError(e2eResult.status);
  }

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
    throw new BackendApiError(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw toBackendApiError(UPSTREAM_FAILURE_STATUS);
  }
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
  ): Promise<T> {
    return request<T>(
      path,
      headers,
      {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        method: 'POST',
      },
      contextToken,
    );
  },
};
