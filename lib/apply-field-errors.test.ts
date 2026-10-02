import { describe, expect, it, vi } from 'vitest';
import { applyFieldErrors } from './apply-field-errors';

describe('applyFieldErrors', () => {
  it('sets each known field once, focuses only the first, and ignores unknown keys', () => {
    const setError = vi.fn();

    applyFieldErrors<{ branchCode: string; branchName: string }>(
      setError,
      { branchName: 'Too short', branchCode: 'Taken', idempotencyKey: 'Invalid' },
      ['branchCode', 'branchName'],
    );

    expect(setError.mock.calls).toEqual([
      ['branchCode', { type: 'server', message: 'Taken' }, { shouldFocus: true }],
      ['branchName', { type: 'server', message: 'Too short' }, { shouldFocus: false }],
    ]);
  });
});
