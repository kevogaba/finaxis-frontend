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
    expect(describeProblem(new BackendApiError(status)).title).toBe(title);
  });

  it('keeps the backend request id as a support reference', () => {
    const view = describeProblem(
      new BackendApiError(500, { requestId: 'req-9', code: 'internal_error' }),
    );
    expect(view).toMatchObject({ requestId: 'req-9', code: 'internal_error' });
  });

  it('explains a response that no longer matches the contract (schema drift) with a support reference', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = z.object({ id: z.string() }).safeParse({});
    if (result.success) throw new Error('expected a parse failure');

    expect(describeProblem(result.error)).toMatchObject({
      title: 'Something went wrong',
      message: expect.stringMatching(/couldn.t read/i),
      requestId: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('never exposes an arbitrary error message', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(describeProblem(new Error('secret stack detail')).message).not.toContain('secret');

    consoleError.mockRestore();
  });
});
