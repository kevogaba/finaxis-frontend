import { describe, expect, it } from 'vitest';
import {
  branchPageSchema,
  profileSchema,
  selectOrganisationResponseSchema,
} from './context-contract';

const page = {
  number: 0,
  size: 25,
  total_items: 2,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

const profile = {
  user_id: 'u-1',
  keycloak_subject: 'kc-1',
  email: 'jane@example.test',
  full_name: 'Jane',
  organisation: { id: 'o-1', code: 'umoja', name: 'Umoja SACCO', status: 'ACTIVE' },
  membership: { id: 'm-1', status: 'ACTIVE' },
  selected_branch: null,
  branches: [{ id: 'b-1', code: 'HQ', name: 'Head Office', status: 'ACTIVE' }],
  roles: [{ id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' }],
  permissions: ['branch.view', 'user.view'],
  // BG-33: `branch_ids` is absent, not null, on a TENANT entry.
  permission_scopes: [
    { code: 'branch.view', scope: 'TENANT' },
    { code: 'user.view', scope: 'BRANCH', branch_ids: ['b-1', 'b-2'] },
  ],
};

describe('auth context contract', () => {
  it('parses the permission scopes, with branch ids on BRANCH entries only', () => {
    const parsed = profileSchema.parse(profile);
    expect(parsed.permission_scopes).toEqual(profile.permission_scopes);
    expect(parsed.selected_branch).toBeNull();
  });

  it('rejects an unknown scope', () => {
    const entry = { code: 'user.view', scope: 'ORGANISATION' };
    expect(profileSchema.safeParse({ ...profile, permission_scopes: [entry] }).success).toBe(false);
  });

  it('ignores unknown extra fields', () => {
    expect(() => profileSchema.parse({ ...profile, future_field: 1 })).not.toThrow();
  });

  it('rejects a profile missing a required field', () => {
    const { user_id: _omit, ...withoutId } = profile;
    expect(profileSchema.safeParse(withoutId).success).toBe(false);
  });

  // BG-23: the platform lists distinct, ACTIVE rows, so they pass through as sent.
  it('keeps assigned branch ids and branch page rows as the platform sends them', () => {
    const selection = selectOrganisationResponseSchema.parse({
      organisation_id: 'o-1',
      membership_id: 'm-1',
      context_token: 'token',
      context_header: 'X-Active-Organisation-Context',
      branch_id: null,
      requires_branch_selection: true,
      assigned_branch_ids: ['b-1', 'b-2'],
    });
    expect(selection.assigned_branch_ids).toEqual(['b-1', 'b-2']);

    const branches = branchPageSchema.parse({
      items: [
        {
          branch_id: 'b-1',
          branch_code: 'HQ',
          branch_name: 'Head Office',
          branch_status: 'ACTIVE',
        },
        {
          branch_id: 'b-2',
          branch_code: 'WL',
          branch_name: 'Westlands',
          branch_status: 'ACTIVE',
        },
      ],
      page,
    });
    expect(branches.items.map((item) => item.branch_id)).toEqual(['b-1', 'b-2']);
  });
});
