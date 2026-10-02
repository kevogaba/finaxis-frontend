import 'server-only';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { BackendApiError, backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';

/**
 * GET a context-scoped backend resource and validate it. A missing context token is treated like a
 * stale context so pages send the user back through context selection (lib/api/load.ts).
 *
 * No separate session check is needed here: `backendApi.get` resolves the Keycloak access token via
 * `getKeycloakAccessToken`, which throws `BackendApiError(401)` when there is no Better Auth session,
 * and `load()` (lib/api/load.ts) redirects that to `/login`.
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const requestHeaders = await headers();
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    throw new BackendApiError(403, { code: 'invalid_active_tenant_context' });
  }
  return schema.parse(await backendApi.get<unknown>(path, requestHeaders, contextToken));
}
