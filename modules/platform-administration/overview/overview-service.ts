import 'server-only';
import type { TenantStatus } from '../tenants/tenant-contract';
import { listTenants } from '../tenants/tenant-service';
import { listPlatformUsers } from '../users/institution-user-service';

/** The Needs attention preview: the oldest first, at most `size`. Its `totalItems` is the tile's
 * count too, so pending approval and drafts cost no extra read. */
export function listTenantsInStatus(status: TenantStatus, size: number) {
  return listTenants({ status, sort: { by: 'createdAt', dir: 'ASC' }, page: 0, size });
}

/** BG-15: no count endpoint, one `size=1` read. Rejects on failure, for the page's `load()`. */
export async function countTenantsInStatus(status: TenantStatus): Promise<number> {
  const result = await listTenants({
    status,
    sort: { by: 'createdAt', dir: 'DESC' },
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
}

/** The people who can work in the platform now: an ACTIVE account with an ACTIVE membership. */
export async function countPlatformOperators(): Promise<number> {
  const result = await listPlatformUsers({
    userStatus: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    page: 0,
    size: 1,
  });
  return result.page.totalItems;
}
