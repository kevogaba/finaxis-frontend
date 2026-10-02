import { describe, expect, it } from 'vitest';
import { branchListApiPath, parseBranchListQuery } from './branch-query';

const parse = (query: string) => parseBranchListQuery(new URLSearchParams(query));

describe('branch list query', () => {
  it('reads filters, sort, and paging from the URL', () => {
    expect(
      parse(
        'q=%20west%20&status=SUSPENDED&type=OPERATIONS&sortBy=branchName&sortDir=desc&page=2&size=20',
      ),
    ).toEqual({
      q: 'west',
      status: 'SUSPENDED',
      type: 'OPERATIONS',
      sort: { by: 'branchName', dir: 'DESC' },
      page: 2,
      size: 20,
    });
  });

  it('drops anything the backend would reject or answer with a 500', () => {
    expect(parse('status=PAUSED&sortBy=branch_name&size=7&page=-1')).toEqual({
      sort: { by: 'createdAt', dir: 'DESC' },
      page: 0,
      size: 10,
    });
  });

  it('builds the snake_case request with camelCase sort values', () => {
    expect(branchListApiPath(parse('q=west&sortBy=branchCode'))).toBe(
      '/api/v1/branches?q=west&sort_by=branchCode&sort_dir=ASC&page=0&size=10',
    );
  });
});
