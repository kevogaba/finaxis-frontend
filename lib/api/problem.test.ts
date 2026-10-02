import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { describeProblem } from './problem';

describe('describeProblem', () => {
  it.each([
    [403, 'Access denied'],
    [404, 'Not found'],
    [409, 'This changed'],
    [422, 'Check the details'],
    [429, 'Too many requests'],
    [500, 'Something went wrong'],
    [502, 'Something went wrong'],
  ])('maps HTTP %i to a safe title', (status, title) => {
    // 500/502 with no requestId now log a generated support reference (below) — quiet it here so
    // this table stays about title mapping only.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(describeProblem(new BackendApiError(status)).title).toBe(title);
    consoleError.mockRestore();
  });

  it('keeps the backend request id as a support reference', () => {
    const view = describeProblem(
      new BackendApiError(500, { requestId: 'req-9', code: 'internal_error' }),
    );
    expect(view).toMatchObject({ requestId: 'req-9', code: 'internal_error' });
  });

  it('mints and logs a support reference for a 5xx with no backend request id', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = describeProblem(new BackendApiError(502));

    expect(view).toMatchObject({ title: 'Something went wrong', requestId: expect.any(String) });
    expect(view.requestId).not.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(String(view.requestId)));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('502'));

    consoleError.mockRestore();
  });

  it('does not mint a reference for a 4xx with no backend request id', () => {
    expect(describeProblem(new BackendApiError(404)).requestId).toBeNull();
  });

  it('explains a response that no longer matches the contract (schema drift) with a support reference, logging only paths and codes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = z
      .object({ id: z.string(), secret: z.string() })
      .safeParse({ id: 42, secret: 'super-secret-token' });
    if (result.success) throw new Error('expected a parse failure');

    expect(describeProblem(result.error)).toMatchObject({
      title: 'Something went wrong',
      message: expect.stringMatching(/couldn.t read/i),
      requestId: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalled();
    // Pins the "never the values" half of the rule: the logged payload names the failing path and
    // zod issue code only. `id`'s bad value (42) and the sibling `secret` never appear in it.
    const logged = consoleError.mock.calls[0]?.[1];
    expect(JSON.stringify(logged)).not.toContain('super-secret-token');
    expect(JSON.stringify(logged)).not.toContain('42');
    expect(logged).toEqual([{ path: ['id'], code: expect.any(String) }]);

    consoleError.mockRestore();
  });

  it('never exposes an arbitrary error message, and still mints a support reference and logs it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = describeProblem(new Error('secret stack detail'));

    expect(view.message).not.toContain('secret');
    expect(view.requestId).toEqual(expect.any(String));
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(String(view.requestId)),
      expect.anything(),
    );

    consoleError.mockRestore();
  });
});
