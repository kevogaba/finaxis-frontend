import { describe, expect, it } from 'vitest';
import { mockAuthenticate } from './mock-authenticate';

describe('mockAuthenticate', () => {
  it('resolves successfully for a normal identifier', async () => {
    const result = await mockAuthenticate({ identifier: 'member@finaxis.test', password: 'x' });
    expect(result).toEqual({ status: 'success' });
  });

  it('returns a generic error for the locked demo account, case-insensitively', async () => {
    const result = await mockAuthenticate({
      identifier: '  LOCKED@Finaxis.test  ',
      password: 'x',
    });
    expect(result.status).toBe('error');
  });
});
