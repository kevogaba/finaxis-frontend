import 'server-only';
import { cache } from 'react';
import { toQueryString } from '@/lib/api/query-string';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import {
  permissionPageSchema,
  roleAssignmentPageSchema,
  roleDetailSchema,
  rolePageSchema,
  rolePermissionPageSchema,
  type RoleAssignmentStatus,
  type RoleScopeType,
} from './role-contract';
import { roleListApiPath, type RoleListQuery } from './role-query';

interface Paging {
  page: number;
  size: number;
}

export function listRoles(query: RoleListQuery) {
  return apiGet(roleListApiPath(query), rolePageSchema);
}

/** One read per request: the record layout (hero) and its tabs share it. `async`, so a malformed
 * id rejects (a `load()` failure) instead of throwing synchronously past `load()`. */
export const getRole = cache(async (roleId: string) => {
  const id = uuidSchema.parse(roleId);
  return await apiGet(`/api/v1/tenant/roles/${id}`, roleDetailSchema);
});

/** A role's grants, newest first (contract §E.3). */
export async function listRolePermissions(roleId: string, paging: Paging) {
  const id = uuidSchema.parse(roleId);
  const query = toQueryString({ page: paging.page, size: paging.size });
  return await apiGet(`/api/v1/tenant/roles/${id}/permissions${query}`, rolePermissionPageSchema);
}

/** BG-15: no count endpoint, so one `size=1` read; null when unreadable. */
export async function countRolePermissions(roleId: string): Promise<number | null> {
  try {
    return (await listRolePermissions(roleId, { page: 0, size: 1 })).page.totalItems;
  } catch {
    return null;
  }
}

// ponytail: one page of 100 holds every grant (the catalogue has 80 codes, contract §F).
const GRANT_CEILING = 100;

/** Every code the role holds, for the grant drawer's "not yet granted" filter; null when
 * unreadable. */
export async function listGrantedCodes(roleId: string): Promise<ReadonlySet<string> | null> {
  try {
    const grants = await listRolePermissions(roleId, { page: 0, size: GRANT_CEILING });
    return new Set(grants.items.map((grant) => grant.permissionCode));
  } catch {
    return null;
  }
}

export interface RoleAssignmentFilter {
  roleId?: string;
  userId?: string;
  branchId?: string;
  scopeType?: RoleScopeType;
  status?: RoleAssignmentStatus;
}

const optionalId = (value: string | undefined) =>
  value === undefined ? undefined : uuidSchema.parse(value);

/** `GET /tenant/role-assignments`: newest first, never branch-restricted (contract §E.4). Layer 10
 * reads a user's roles with `{ userId }`; 12 reads a pending user's requested roles. */
export async function listRoleAssignments(filter: RoleAssignmentFilter, paging: Paging) {
  const query = toQueryString({
    user_id: optionalId(filter.userId),
    role_id: optionalId(filter.roleId),
    branch_id: optionalId(filter.branchId),
    scope_type: filter.scopeType,
    status: filter.status,
    page: paging.page,
    size: paging.size,
  });
  return await apiGet(`/api/v1/tenant/role-assignments${query}`, roleAssignmentPageSchema);
}

/** BG-15: one `size=1` read; null when unreadable. It counts assignments, not distinct users
 * (Ruling 11). */
export async function countActiveRoleAssignments(roleId: string): Promise<number | null> {
  try {
    const page = await listRoleAssignments({ roleId, status: 'ACTIVE' }, { page: 0, size: 1 });
    return page.page.totalItems;
  } catch {
    return null;
  }
}

// ponytail: the catalogue is 80 codes (contract §F), so a page of 100 holds it. Past that, the
// rest render as codes and the drawer says the list is truncated.
const CATALOGUE_PATH =
  '/api/v1/tenant/permissions?page=0&size=100&sort_by=permissionCode&sort_dir=ASC';

/** The permission catalogue, every status: granted DEPRECATED/DISABLED codes still need their
 * names. null without `permission.view` or when unreadable. */
export const getPermissionCatalogue = cache(async () => {
  try {
    return await apiGet(CATALOGUE_PATH, permissionPageSchema);
  } catch {
    return null;
  }
});
