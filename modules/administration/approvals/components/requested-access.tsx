import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { SectionCard } from '@/components/data-display/section-card';
import type { Loaded } from '@/lib/api/load';
import type { RoleIndexEntry } from '@/lib/api/lookups';
import type { Page } from '@/lib/api/wire';
import { formatInstant, shortId } from '@/lib/format';
import type { BranchAssignment } from '@/modules/administration/branches/branch-contract';
import type { RoleAssignment } from '@/modules/administration/roles/role-contract';
import { SCOPED_ROLE_ASSIGNMENTS_NOTE } from '@/modules/administration/roles/role-rules';
import { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import { UserRoleAssignmentsTable } from '@/modules/administration/users/components/user-role-assignments-table';
import type {
  MembershipDetail,
  MembershipType,
} from '@/modules/administration/users/user-contract';
import { SCOPED_ASSIGNMENTS_NOTE } from '@/modules/administration/users/user-rules';
import {
  BRANCHES_CAPPED,
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_BRANCH_SEEN,
  NO_ACTIVE_ROLE,
  NO_ACTIVE_ROLE_SEEN,
  REQUESTED_ACCESS_DESCRIPTION,
  ROLES_CAPPED,
  ROLES_NOT_PERMITTED,
} from '../approval-copy';
import { ReadFailed } from './request-facts';

/** Each read as the page settled it; `null`: the holder lacks its code, so nothing was read. */
interface RequestedAccessProps {
  userName: string;
  /** From the user read, which carries it (BG-09). */
  membershipType: MembershipType;
  /** Read by the id the user read carries, for the primary branch. */
  membership: Loaded<MembershipDetail> | null;
  /** One page of the user's ACTIVE role assignments (Ruling 8). */
  roles: Loaded<Page<RoleAssignment>> | null;
  /** One page of their ACTIVE branch assignments, branch names embedded (BG-09). */
  branches: Loaded<Page<BranchAssignment>> | null;
  /** The organisation's, for the Assigned column. */
  timeZone: string;
  roleIndex: ReadonlyMap<string, RoleIndexEntry>;
  branchIndex: ReadonlyMap<string, { name: string; code: string }>;
  /** The holder views only some branches' assignments (`scopedAssignmentView`, BG-03). */
  scopedView: boolean;
  /** The holder views only some branches' role assignments (`scopedRoleAssignmentView`, BG-03). */
  rolesScoped?: boolean;
}

const MUTED_SX = { color: 'text.secondary', px: 4.5, py: 2 } as const;

function subheading(text: string): ReactNode {
  return (
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, px: 4.5, pt: 3 }}>
      {text}
    </Typography>
  );
}

function membershipFact(
  membership: Loaded<MembershipDetail> | null,
  show: (found: MembershipDetail) => string,
): ReactNode {
  if (membership === null) return MEMBERSHIP_NOT_PERMITTED;
  return membership.ok ? show(membership.value) : <ReadFailed problem={membership.problem} />;
}

/** The access a pending user gets once approved (spec §10.6): the membership's type and primary
 * branch, their roles and their branches (one page each, capped and said so). A read that failed
 * says so, never "none" (rule 9). Server-Component safe. */
export function RequestedAccess({
  userName,
  membershipType,
  membership,
  roles,
  branches,
  timeZone,
  roleIndex,
  branchIndex,
  scopedView,
  rolesScoped = false,
}: RequestedAccessProps) {
  const branchName = (id: string) => {
    const branch = branchIndex.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  return (
    <SectionCard title="Requested access" description={REQUESTED_ACCESS_DESCRIPTION}>
      <DescriptionList
        items={[
          { label: 'Membership type', value: humanizeEnum(membershipType) },
          {
            label: 'Primary branch',
            value: membershipFact(membership, (found) =>
              found.primaryBranchId ? branchName(found.primaryBranchId) : 'None',
            ),
          },
        ]}
      />
      {subheading('Roles')}
      {roles === null ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {ROLES_NOT_PERMITTED}
        </Typography>
      ) : !roles.ok ? (
        <ErrorState problem={roles.problem} />
      ) : roles.value.items.length === 0 ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {rolesScoped ? NO_ACTIVE_ROLE_SEEN : NO_ACTIVE_ROLE}
        </Typography>
      ) : (
        <>
          {(rolesScoped || roles.value.page.hasNext) && (
            <Box sx={{ px: 4, py: 2, display: 'grid', gap: 2 }}>
              {rolesScoped && (
                <Alert severity="info" role="note">
                  {SCOPED_ROLE_ASSIGNMENTS_NOTE}
                </Alert>
              )}
              {roles.value.page.hasNext && (
                <Alert severity="info" role="note">
                  {ROLES_CAPPED}
                </Alert>
              )}
            </Box>
          )}
          <UserRoleAssignmentsTable
            userName={userName}
            self={false}
            canRevoke={false}
            rows={roles.value.items.map((row) => {
              const role = roleIndex.get(row.roleId);
              return {
                assignmentId: row.id,
                roleName: role?.name ?? shortId(row.roleId),
                roleCode: role?.code ?? null,
                roleStatus: role?.status ?? null,
                scopeType: row.scopeType,
                branchLabel: row.branchId
                  ? (branchIndex.get(row.branchId)?.name ?? shortId(row.branchId))
                  : 'All branches',
                revocable: false,
              };
            })}
          />
        </>
      )}
      {subheading('Branch assignments')}
      {branches === null ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {BRANCHES_NOT_PERMITTED}
        </Typography>
      ) : !branches.ok ? (
        <ErrorState problem={branches.problem} />
      ) : (
        <>
          {(scopedView || branches.value.page.hasNext) && (
            <Box sx={{ px: 4, py: 2, display: 'grid', gap: 2 }}>
              {scopedView && (
                <Alert severity="info" role="note">
                  {SCOPED_ASSIGNMENTS_NOTE}
                </Alert>
              )}
              {branches.value.page.hasNext && (
                <Alert severity="info" role="note">
                  {BRANCHES_CAPPED}
                </Alert>
              )}
            </Box>
          )}
          {branches.value.items.length === 0 ? (
            <Typography variant="body2" sx={MUTED_SX}>
              {/* A branch-scoped view sees only its branches, so "none" would be a guess under the
                  note saying so (rule 9; 10's branchAssignmentsEmptyState). */}
              {scopedView ? NO_ACTIVE_BRANCH_SEEN : NO_ACTIVE_BRANCH}
            </Typography>
          ) : (
            <UserBranchAssignmentsTable
              userName={userName}
              self={false}
              canRevoke={false}
              timeZone={timeZone}
              rows={branches.value.items.map((row) => {
                const when = formatInstant(row.assignedAt, timeZone);
                return {
                  assignmentId: row.id,
                  branchName: row.branchName,
                  assignmentType: row.assignmentType,
                  assignedAt: `${when.date} · ${when.time}`,
                  revocable: false,
                };
              })}
            />
          )}
        </>
      )}
    </SectionCard>
  );
}
