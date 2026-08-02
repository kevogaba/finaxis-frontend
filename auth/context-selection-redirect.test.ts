import { describe, expect, it } from 'vitest';
import { REQUEST_PATHNAME_HEADER } from './auth.types';
import { contextSelectionRedirectPath } from './context-selection-redirect';

describe('contextSelectionRedirectPath', () => {
  it('preserves the originally requested path as a next destination', () => {
    const headers = new Headers({ [REQUEST_PATHNAME_HEADER]: '/platform-admin/tenants' });

    expect(contextSelectionRedirectPath(headers)).toBe(
      '/select-context?next=%2Fplatform-admin%2Ftenants',
    );
  });

  it('falls back to the plain select-context path when no pathname was forwarded', () => {
    expect(contextSelectionRedirectPath(new Headers())).toBe('/select-context');
  });
});
