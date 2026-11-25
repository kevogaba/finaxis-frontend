import 'server-only';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import { listInstitutionBranches } from '../branches/institution-branch-service';
import { listInstitutionUsers } from '../users/institution-user-service';

/** The members window's one bounded read (`checkerWindow`): the institution's ACTIVE members,
 * `size=1`, whose total and first row decide it. */
export function readActiveMembers(tenantId: string) {
  return listInstitutionUsers(tenantId, { membershipStatus: 'ACTIVE', page: 0, size: 1 });
}

/** The branches window's one bounded read: the institution's ACTIVE branches, `size=1`. */
export function readActiveBranches(tenantId: string) {
  return listInstitutionBranches(tenantId, {
    status: 'ACTIVE',
    sort: DEFAULT_BRANCH_SORT,
    page: 0,
    size: 1,
  });
}
