import { describe, expect, it } from 'vitest';
import {
  permissionPageSchema,
  roleAssignmentPageSchema,
  roleCreatedSchema,
  roleDetailSchema,
  rolePageSchema,
  rolePermissionPageSchema,
} from './role-contract';

const TELLER = '09000000-0000-4000-8000-000000000007';
const USER = '09000000-0000-4000-8000-000000000004';
const ASSIGNMENT = '09000000-0000-4000-8000-00000000000d';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const PERMISSION = '09000000-0000-4000-8000-000000000131';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: TELLER,
  organisation_id: '11111111-1111-4111-8111-111111111111',
  role_code: 'TELLER',
  role_name: 'Teller',
  description: 'Front-desk cash and member service.',
  system_role: false,
  status: 'ACTIVE',
  created_at: '2026-08-01T08:00:00Z',
  updated_at: '2026-08-02T08:00:00Z',
};

describe('role contract', () => {
  it('maps a role detail and reads a blank description as none', () => {
    expect(roleDetailSchema.parse(DETAIL)).toEqual({
      id: TELLER,
      roleCode: 'TELLER',
      roleName: 'Teller',
      description: 'Front-desk cash and member service.',
      systemRole: false,
      status: 'ACTIVE',
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-08-02T08:00:00Z',
    });
    expect(roleDetailSchema.parse({ ...DETAIL, description: '  ' }).description).toBeNull();
    expect(roleDetailSchema.parse({ ...DETAIL, description: null }).description).toBeNull();
  });

  it('rejects drift: an unknown role status, scope type or risk level (→ error state)', () => {
    expect(roleDetailSchema.safeParse({ ...DETAIL, status: 'RETIRED' }).success).toBe(false);
    expect(
      roleAssignmentPageSchema.safeParse({
        items: [
          {
            id: ASSIGNMENT,
            user_id: USER,
            role_id: TELLER,
            branch_id: null,
            scope_type: 'REGION',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).success,
    ).toBe(false);
    expect(
      permissionPageSchema.safeParse({
        items: [
          {
            id: PERMISSION,
            permission_code: 'cob.start',
            permission_name: 'Start close of business',
            module_code: 'settings',
            risk_level: 'SEVERE',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).success,
    ).toBe(false);
  });

  it('maps directory, grant, assignment and catalogue pages, which carry nothing else (D8)', () => {
    expect(
      rolePageSchema.parse({
        items: [
          {
            id: TELLER,
            role_code: 'TELLER',
            role_name: 'Teller',
            system_role: false,
            status: 'DISABLED',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: TELLER,
      roleCode: 'TELLER',
      roleName: 'Teller',
      systemRole: false,
      status: 'DISABLED',
    });
    expect(
      rolePermissionPageSchema.parse({
        items: [
          {
            id: GRANT,
            role_id: TELLER,
            permission_id: PERMISSION,
            permission_code: 'cob.start',
            granted_at: '2026-09-01T10:00:00.123Z',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({ id: GRANT, permissionCode: 'cob.start', grantedAt: '2026-09-01T10:00:00.123Z' });
    expect(
      roleAssignmentPageSchema.parse({
        items: [
          {
            id: ASSIGNMENT,
            user_id: USER,
            role_id: TELLER,
            branch_id: null,
            scope_type: 'TENANT',
            status: 'ACTIVE',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: ASSIGNMENT,
      userId: USER,
      roleId: TELLER,
      branchId: null,
      scopeType: 'TENANT',
      status: 'ACTIVE',
    });
    expect(
      permissionPageSchema.parse({
        items: [
          {
            id: PERMISSION,
            permission_code: 'business_date.advance',
            permission_name: 'Advance business date',
            module_code: 'settings',
            risk_level: 'CRITICAL',
            status: 'DEPRECATED',
          },
        ],
        page: PAGE,
      }).items[0],
    ).toEqual({
      id: PERMISSION,
      code: 'business_date.advance',
      name: 'Advance business date',
      module: 'settings',
      risk: 'CRITICAL',
      status: 'DEPRECATED',
    });
  });

  it('reads only the new role id from the create echo', () => {
    expect(roleCreatedSchema.parse({ ...DETAIL, status: 'SOMETHING_NEW' })).toEqual({
      roleId: TELLER,
    });
  });
});
