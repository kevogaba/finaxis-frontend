import { describe, expect, it } from 'vitest';
import { parseBranchListQuery } from '@/modules/administration/branches/branch-query';
import { institutionBranchesHref, institutionBranchListApiPath } from './institution-branch-query';

const ID = '17000000-0000-4000-8000-0000000000ac';

describe('institution branch query', () => {
  it("lists an institution's branches with the /branches filters and sort, scoped by the path", () => {
    const query = parseBranchListQuery(
      new URLSearchParams(
        'q=  road  &status=SUSPENDED&type=OPERATIONS&sortBy=branchCode&sortDir=asc&page=2&size=20',
      ),
    );
    expect(institutionBranchListApiPath(ID, query)).toBe(
      `/api/v1/platform/tenants/${ID}/branches?q=road&status=SUSPENDED&type=OPERATIONS&sort_by=branchCode&sort_dir=ASC&page=2&size=20`,
    );
  });

  it('never sends an off-list sort or an unknown status (an unknown sort_by is a backend 500)', () => {
    const query = parseBranchListQuery(new URLSearchParams('sortBy=toString&status=BOGUS'));
    expect(institutionBranchListApiPath(ID, query)).toBe(
      `/api/v1/platform/tenants/${ID}/branches?sort_by=createdAt&sort_dir=DESC&page=0&size=10`,
    );
  });

  it("builds the tab's path", () => {
    expect(institutionBranchesHref(ID)).toBe(`/platform-admin/tenants/${ID}/branches`);
  });
});
