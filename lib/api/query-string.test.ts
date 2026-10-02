import { describe, expect, it } from 'vitest';
import { toQueryString, toSearchParams } from './query-string';

describe('toQueryString', () => {
  it('drops undefined and empty values and encodes the rest', () => {
    expect(toQueryString({ q: 'a b', status: undefined, page: 0, empty: '' })).toBe(
      '?q=a+b&page=0',
    );
  });

  it('returns an empty string when nothing remains', () => {
    expect(toQueryString({ q: undefined })).toBe('');
  });
});

describe('toSearchParams', () => {
  it('keeps the first value of repeated params and drops empty ones', () => {
    expect(
      toSearchParams({ page: '2', status: ['ACTIVE', 'DRAFT'], q: '', size: undefined }).toString(),
    ).toBe('page=2&status=ACTIVE');
  });
});
