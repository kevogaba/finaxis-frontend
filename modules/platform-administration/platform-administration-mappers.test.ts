import { describe, expect, it } from 'vitest';
import {
  mapBranch,
  mapBranchPage,
  mapTenantUser,
  mapTenantUserPage,
} from './platform-administration-mappers';

describe('platform administration response mappers', () => {
  it('maps snake_case page metadata and user fields to camelCase DTOs', () => {
    expect(
      mapTenantUserPage({
        items: [
          {
            id: 'user-id',
            username: 'user',
            email: 'user@example.test',
            display_name: 'User',
            user_status: 'ACTIVE',
            membership_status: 'ACTIVE',
          },
        ],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }),
    ).toEqual({
      items: [
        {
          id: 'user-id',
          username: 'user',
          email: 'user@example.test',
          displayName: 'User',
          userStatus: 'ACTIVE',
          membershipStatus: 'ACTIVE',
        },
      ],
      page: {
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('covers each resource mapper used by the read service', () => {
    const user = {
      id: 'user-id',
      username: 'user',
      email: 'user@example.test',
      display_name: 'User',
      user_status: 'ACTIVE',
      membership_status: 'ACTIVE',
    };
    const branch = {
      id: 'branch-id',
      organisation_id: 'org-id',
      branch_code: 'HQ',
      branch_name: 'Head Office',
      branch_type: 'HEAD_OFFICE',
      parent_branch_id: null,
      status: 'ACTIVE',
      timezone: 'Africa/Nairobi',
      address: {},
      opened_on: null,
      closed_on: null,
      status_reason: null,
      created_at: '2026-07-26T00:00:00Z',
      updated_at: '2026-07-26T00:00:00Z',
    };
    expect(mapTenantUser(user).displayName).toBe('User');
    expect(
      mapTenantUserPage({
        items: [user],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }).items,
    ).toHaveLength(1);
    expect(mapBranch(branch).branchName).toBe('Head Office');
    expect(
      mapBranchPage({
        items: [branch],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }).items,
    ).toHaveLength(1);
  });
});
