import { describe, expect, it } from 'vitest';
import { lastPageIfPastEnd, parsePaging } from './paging';

function page(overrides: Partial<Parameters<typeof lastPageIfPastEnd>[0]> = {}) {
  return {
    number: 0,
    size: 20,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
    ...overrides,
  };
}

describe('parsePaging', () => {
  it('drops a negative or non-integer page and an unlisted size', () => {
    expect(parsePaging(new URLSearchParams('page=-1&size=7'), 20)).toEqual({ page: 0, size: 20 });
  });
});

describe('lastPageIfPastEnd', () => {
  it('redirects a page past the end (30 events, size 20, requested page 5)', () => {
    expect(lastPageIfPastEnd(page({ number: 5, size: 20, totalItems: 30, totalPages: 2 }))).toBe(1);
  });

  it('does not redirect a page within range', () => {
    expect(lastPageIfPastEnd(page({ number: 1, size: 20, totalItems: 30, totalPages: 2 }))).toBe(
      null,
    );
  });

  it('does not redirect an empty tenant (no items at all)', () => {
    expect(lastPageIfPastEnd(page({ number: 0, totalItems: 0, totalPages: 0 }))).toBe(null);
  });

  it('does not redirect page 0 when totalItems > 0 but totalPages is 0 (the max() guard)', () => {
    // Without Math.max(0, totalPages - 1), lastPage would be -1 and 0 > -1 would wrongly redirect
    // page 0 for this malformed-but-plausible page metadata (e.g. a size of 0).
    expect(lastPageIfPastEnd(page({ number: 0, totalItems: 5, totalPages: 0 }))).toBe(null);
  });
});
