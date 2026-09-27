import { describe, expect, it } from 'vitest';
import { parseListSort, sortQuery, type ListSort } from './list-sort';

const FIELDS = ['branchName', 'branchCode', 'createdAt'] as const;
type Field = (typeof FIELDS)[number];
const DEFAULT: ListSort<Field> = { by: 'createdAt', dir: 'DESC' };
const parse = (query: string) => parseListSort(new URLSearchParams(query), FIELDS, DEFAULT);

describe('list sort', () => {
  it('reads an allow-listed field and direction from the URL', () => {
    expect(parse('sortBy=branchName&sortDir=DESC')).toEqual({ by: 'branchName', dir: 'DESC' });
    expect(parse('sortBy=branchCode&sortDir=asc')).toEqual({ by: 'branchCode', dir: 'ASC' });
  });

  it('falls back for a missing or non-allow-listed field (an unknown sort_by is a backend 500)', () => {
    expect(parse('')).toEqual(DEFAULT);
    expect(parse('sortBy=branch_name&sortDir=ASC')).toEqual(DEFAULT);
    expect(parse('sortBy=passwordHash')).toEqual(DEFAULT);
  });

  it('sorts an allow-listed field ascending when the direction is missing or invalid', () => {
    expect(parse('sortBy=branchName')).toEqual({ by: 'branchName', dir: 'ASC' });
    expect(parse('sortBy=branchName&sortDir=sideways')).toEqual({ by: 'branchName', dir: 'ASC' });
  });

  it('maps to the snake_case wire params', () => {
    expect(sortQuery({ by: 'branchName', dir: 'ASC' })).toEqual({
      sort_by: 'branchName',
      sort_dir: 'ASC',
    });
  });
});
