import 'server-only';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { BackendApiError, backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';

async function contextRequest(): Promise<{ requestHeaders: Headers; contextToken: string }> {
  const requestHeaders = await headers();
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    throw new BackendApiError(403, { code: 'invalid_active_tenant_context' });
  }
  return { requestHeaders, contextToken };
}

/**
 * GET a context-scoped backend resource and validate it. A missing context token is treated like a
 * stale context so pages send the user back through context selection (lib/api/load.ts).
 *
 * No separate session check is needed here: `backendApi.get` resolves the Keycloak access token via
 * `getKeycloakAccessToken`, which throws `BackendApiError(401)` when there is no Better Auth session,
 * and `load()` (lib/api/load.ts) redirects that to `/login`.
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const { requestHeaders, contextToken } = await contextRequest();
  return schema.parse(await backendApi.get<unknown>(path, requestHeaders, contextToken));
}

/** POST a context-scoped mutation with the caller's idempotency key. Callers parse what they use. */
export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  const { requestHeaders, contextToken } = await contextRequest();
  return backendApi.post<unknown>(path, body, requestHeaders, contextToken, idempotencyKey);
}

/** PUT a context-scoped mutation with the caller's idempotency key. */
export async function apiPut(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  const { requestHeaders, contextToken } = await contextRequest();
  return backendApi.put<unknown>(path, body, requestHeaders, contextToken, idempotencyKey);
}

/** PATCH a context-scoped mutation with the caller's idempotency key. */
export async function apiPatch(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  const { requestHeaders, contextToken } = await contextRequest();
  return backendApi.patch<unknown>(path, body, requestHeaders, contextToken, idempotencyKey);
}

/** DELETE a context-scoped mutation with the caller's idempotency key and an optional body. */
export async function apiDelete(
  path: string,
  idempotencyKey: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const { requestHeaders, contextToken } = await contextRequest();
  return backendApi.delete<unknown>(path, requestHeaders, contextToken, idempotencyKey, body);
}
