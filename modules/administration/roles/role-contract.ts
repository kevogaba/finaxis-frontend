import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

export const ROLE_STATUSES = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

/** `sort_by` allow-list for `GET /tenant/roles` (contract §E.3); anything else is a backend 500. */
export const ROLE_SORT_FIELDS = ['roleName', 'roleCode', 'status', 'createdAt'] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

export const PERMISSION_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type PermissionRiskLevel = (typeof PERMISSION_RISK_LEVELS)[number];

export const PERMISSION_STATUSES = ['ACTIVE', 'DEPRECATED', 'DISABLED'] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];

/** TENANT applies at every branch and at institution level; BRANCH only while that branch is the
 * selected context (contract §F). */
export const ROLE_SCOPE_TYPES = ['TENANT', 'BRANCH'] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];

export const ROLE_ASSIGNMENT_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type RoleAssignmentStatus = (typeof ROLE_ASSIGNMENT_STATUSES)[number];

/** A blank description reads as none. */
const descriptionSchema = z
  .string()
  .nullable()
  .transform((value) => (value?.trim() ? value : null));

const roleSummarySchema = z
  .object({
    id: uuidSchema,
    role_code: z.string(),
    role_name: z.string(),
    system_role: z.boolean(),
    status: z.enum(ROLE_STATUSES),
  })
  .transform((role) => ({
    id: role.id,
    roleCode: role.role_code,
    roleName: role.role_name,
    systemRole: role.system_role,
    status: role.status,
  }));

/** Role summaries carry nothing else: no description, dates, or counts (D8, BG-09, BG-15). */
export type RoleSummary = z.output<typeof roleSummarySchema>;

export const rolePageSchema = pageSchema(roleSummarySchema);

export const roleDetailSchema = z
  .object({
    id: uuidSchema,
    role_code: z.string(),
    role_name: z.string(),
    description: descriptionSchema,
    system_role: z.boolean(),
    status: z.enum(ROLE_STATUSES),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((role) => ({
    id: role.id,
    roleCode: role.role_code,
    roleName: role.role_name,
    description: role.description,
    systemRole: role.system_role,
    status: role.status,
    createdAt: role.created_at,
    updatedAt: role.updated_at,
  }));

export type RoleDetail = z.output<typeof roleDetailSchema>;

// Only the id: a create that succeeded must never fail on its echo (08's branchDraftResultSchema).
export const roleCreatedSchema = z
  .object({ id: uuidSchema })
  .transform((role) => ({ roleId: role.id }));

const permissionSchema = z
  .object({
    id: uuidSchema,
    permission_code: z.string(),
    permission_name: z.string(),
    // tenant/branch/iam/audit/settings/accounting today; free text, so a new module never breaks.
    module_code: z.string(),
    risk_level: z.enum(PERMISSION_RISK_LEVELS),
    status: z.enum(PERMISSION_STATUSES),
  })
  .transform((permission) => ({
    id: permission.id,
    code: permission.permission_code,
    name: permission.permission_name,
    module: permission.module_code,
    risk: permission.risk_level,
    status: permission.status,
  }));

export type Permission = z.output<typeof permissionSchema>;

export const permissionPageSchema = pageSchema(permissionSchema);

const rolePermissionSchema = z
  .object({
    id: uuidSchema,
    role_id: uuidSchema,
    permission_id: uuidSchema,
    permission_code: z.string(),
    granted_at: instantSchema,
  })
  .transform((grant) => ({
    // The role-permission id that DELETE takes (contract §C).
    id: grant.id,
    permissionCode: grant.permission_code,
    grantedAt: grant.granted_at,
  }));

export type RolePermissionGrant = z.output<typeof rolePermissionSchema>;

export const rolePermissionPageSchema = pageSchema(rolePermissionSchema);

const roleAssignmentSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    role_id: uuidSchema,
    branch_id: uuidSchema.nullable(),
    scope_type: z.enum(ROLE_SCOPE_TYPES),
    status: z.enum(ROLE_ASSIGNMENT_STATUSES),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    roleId: row.role_id,
    // null exactly for TENANT scope (contract §C).
    branchId: row.branch_id,
    scopeType: row.scope_type,
    status: row.status,
  }));

export type RoleAssignment = z.output<typeof roleAssignmentSchema>;

export const roleAssignmentPageSchema = pageSchema(roleAssignmentSchema);
