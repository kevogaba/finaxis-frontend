/**
 * Post-context-selection destinations: only same-origin authenticated app paths under an
 * allow-listed prefix (AGENTS.md: never accept an unvalidated redirect).
 */
export const DEFAULT_CONTEXT_DESTINATION = '/profile';

const ALLOWED_PREFIXES = ['/admin', '/platform-admin', '/profile'] as const;
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;
const MAX_LENGTH = 200;

export function safeContextDestination(value: string | undefined): string {
  if (!value || value.length > MAX_LENGTH || !SAFE_PATH.test(value) || value.includes('//')) {
    return DEFAULT_CONTEXT_DESTINATION;
  }
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  );
  return allowed ? value : DEFAULT_CONTEXT_DESTINATION;
}
