import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('returns the first and last initials for a two-word name', () => {
    expect(initialsOf('Jane Muthoni')).toBe('JM');
  });

  it('returns a single initial for a one-word name', () => {
    expect(initialsOf('Cher')).toBe('C');
  });

  it('returns "?" for a blank name', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
