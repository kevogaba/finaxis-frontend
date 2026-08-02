import { REQUEST_PATHNAME_HEADER } from './auth.types';

/**
 * Server Component layouts have no direct access to the current request's
 * pathname, so proxy.ts forwards it via REQUEST_PATHNAME_HEADER. Read it back
 * here so a context-selection redirect can return the user to where they were
 * headed instead of always landing on the default destination.
 */
export function contextSelectionRedirectPath(headers: Headers): string {
  const requestedPath = headers.get(REQUEST_PATHNAME_HEADER);
  if (!requestedPath) {
    return '/select-context';
  }

  return `/select-context?next=${encodeURIComponent(requestedPath)}`;
}
