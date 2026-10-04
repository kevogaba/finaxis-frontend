import 'server-only';
import { cache } from 'react';
import { serverEnv } from '@/config/env.server';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema } from '@/lib/api/wire';
import { userPageSchema, userSummarySchema } from '@/modules/administration/users/user-contract';
import type { UserListQuery } from '@/modules/administration/users/user-query';
import { institutionUserListApiPath } from './institution-user-query';

const id = (value: string) => uuidSchema.parse(value).toLowerCase();

export async function listInstitutionUsers(tenantId: string, query: UserListQuery) {
  return await apiGet(institutionUserListApiPath(id(tenantId), query), userPageSchema);
}

/** One read per request: `UserInTenantSummary` (contract §E.2), 10's schema. */
export const getInstitutionUser = cache(async (tenantId: string, userId: string) => {
  return await apiGet(
    `/api/v1/platform/tenants/${id(tenantId)}/users/${id(userId)}`,
    userSummarySchema,
  );
});

/** BG-10: no global directory; platform users are the platform organisation's members. */
export function listPlatformUsers(query: UserListQuery) {
  return listInstitutionUsers(serverEnv.PLATFORM_ORGANISATION_ID, query);
}

export function getPlatformUser(userId: string) {
  return getInstitutionUser(serverEnv.PLATFORM_ORGANISATION_ID, userId);
}
