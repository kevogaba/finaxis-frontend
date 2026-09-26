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
  branches: [
    { id: 'b-1', code: 'HQ', name: 'Head Office', status: 'ACTIVE' },
    { id: 'b-1', code: 'HQ', name: 'Head Office', status: 'ACTIVE' },
  ],
  roles: [
    { id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' },
    { id: 'r-1', code: 'TENANT_ADMIN', name: 'Tenant admin', status: 'ACTIVE' },
  ],
  permissions: ['user.view'],
};

describe('auth context contract', () => {
  it('de-duplicates branches and roles in the profile (one row per assignment upstream)', () => {
    const parsed = profileSchema.parse(profile);
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.roles).toHaveLength(1);
    expect(parsed.selected_branch).toBeNull();
  });

  it('ignores unknown extra fields', () => {
    expect(() => profileSchema.parse({ ...profile, future_field: 1 })).not.toThrow();
  });

  it('rejects a profile missing a required field', () => {
    const { user_id: _omit, ...withoutId } = profile;
    expect(profileSchema.safeParse(withoutId).success).toBe(false);
  });

  it('de-duplicates assigned branch ids and branch page rows', () => {
    const selection = selectOrganisationResponseSchema.parse({
      organisation_id: 'o-1',
      membership_id: 'm-1',
      context_token: 'token',
      context_header: 'X-Active-Organisation-Context',
      branch_id: null,
      requires_branch_selection: true,
      assigned_branch_ids: ['b-1', 'b-1'],
    });
    expect(selection.assigned_branch_ids).toEqual(['b-1']);

    const branches = branchPageSchema.parse({
      items: [
        {
          branch_id: 'b-1',
          branch_code: 'HQ',
          branch_name: 'Head Office',
          branch_status: 'ACTIVE',
        },
        {
          branch_id: 'b-1',
          branch_code: 'HQ',
          branch_name: 'Head Office',
          branch_status: 'ACTIVE',
        },
      ],
      page,
    });
    expect(branches.items).toHaveLength(1);
  });
});
