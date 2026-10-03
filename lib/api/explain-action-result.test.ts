import { describe, expect, it } from 'vitest';
import type { ActionResult } from './action-result';
import { explain } from './explain-action-result';

const failed = (code: string | null, fieldErrors: Record<string, string> = {}): ActionResult => ({
  ok: false,
  formError: 'generic',
  fieldErrors,
  code,
  requestId: 'req-1',
});

describe('explain', () => {
  it('returns an ok result unchanged', () => {
    const result: ActionResult = { ok: true };
    expect(explain(result, 'conflict', 'named')).toBe(result);
  });

  it('returns a failure with a different code unchanged', () => {
    const result = failed('forbidden');
    expect(explain(result, 'conflict', 'named', { name: 'taken' })).toBe(result);
    expect(explain(failed(null), 'conflict', 'named')).toMatchObject({ formError: 'generic' });
  });

  it('replaces the form error of a matching code and keeps its reference', () => {
    expect(explain(failed('conflict'), 'conflict', 'named')).toEqual({
      ok: false,
      formError: 'named',
      fieldErrors: {},
      code: 'conflict',
      requestId: 'req-1',
    });
  });

  it('merges field errors over the existing ones, the new keys winning', () => {
    const result = failed('conflict', { name: 'old', other: 'kept' });
    expect(explain(result, 'conflict', 'named', { name: 'new' })).toMatchObject({
      fieldErrors: { name: 'new', other: 'kept' },
    });
  });
});
