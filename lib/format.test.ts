import { describe, expect, it } from 'vitest';
import { formatInstant, shortId } from './format';

describe('format', () => {
  it('formats an instant in the given timezone as a dense date and 24h time', () => {
    expect(formatInstant('2026-09-07T07:28:00Z', 'Africa/Nairobi')).toEqual({
      date: '07 Sep 2026',
      time: '10:28',
    });
    expect(formatInstant('2026-09-07T07:28:00Z', 'UTC')).toEqual({
      date: '07 Sep 2026',
      time: '07:28',
    });
  });

  it('shortens identifiers for display', () => {
    expect(shortId('0b6f2f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('0b6f2f3a');
  });
});
