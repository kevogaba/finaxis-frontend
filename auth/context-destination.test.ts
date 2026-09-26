import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_DESTINATION, safeContextDestination } from './context-destination';

describe('safeContextDestination', () => {
  it.each([
    '/admin',
    '/admin/users/0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b/roles',
    '/platform-admin/tenants',
    '/profile',
    '/profile/contexts',
  ])('keeps the allowed in-app path %s', (path) => {
    expect(safeContextDestination(path)).toBe(path);
  });

  it.each([
    undefined,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/admin//users',
    '/admin/../login',
    '/administrator',
    '/login',
    '/api/auth/logout',
    '/admin?next=https://evil.example',
    `/admin/${'a'.repeat(250)}`,
  ])('falls back for %s', (path) => {
    expect(safeContextDestination(path)).toBe(DEFAULT_CONTEXT_DESTINATION);
  });
});
