import { describe, expect, it } from 'vitest';
import {
  parseBranchListQuery,
  parseUserListQuery,
  toQueryString,
} from './platform-administration-queries';

describe('platform administration query parsing', () => {
  it('normalizes empty filters and parses user and branch filters', () => {
    expect(parseUserListQuery(new URLSearchParams('q=&userStatus=ACTIVE'))).toEqual({
      q: undefined,
      userStatus: 'ACTIVE',
      membershipStatus: undefined,
      page: 0,
      size: 25,
    });
    expect(parseBranchListQuery(new URLSearchParams('type=HEAD_OFFICE&size=10'))).toMatchObject({
      type: 'HEAD_OFFICE',
      page: 0,
      size: 10,
    });
  });

  it('encodes query values and omits undefined values', () => {
    expect(toQueryString({ q: 'Acme Ltd', page: 0, size: 25, status: undefined })).toBe(
      '?q=Acme+Ltd&page=0&size=25',
    );
  });

  it('bounds pagination and rejects malformed pagination values', () => {
    expect(parseBranchListQuery(new URLSearchParams('size=100'))).toMatchObject({ size: 100 });
    expect(() => parseBranchListQuery(new URLSearchParams('size=101'))).toThrow();
    expect(() => parseBranchListQuery(new URLSearchParams('page=-1'))).toThrow();
    expect(parseBranchListQuery(new URLSearchParams('page=not-a-number')).page).toBe(0);
  });
});
