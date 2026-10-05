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
import { shortId } from '@/lib/format';
import type { RoleAssignment } from '@/modules/administration/roles/role-contract';
import { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import { UserRoleAssignmentsTable } from '@/modules/administration/users/components/user-role-assignments-table';
import type { MembershipSummary } from '@/modules/administration/users/user-contract';
import { branchContextNote, PARTIAL_SCAN_NOTE } from '@/modules/administration/users/user-rules';
import type { UserBranchScan } from '@/modules/administration/users/user-service';
import {
  BRANCHES_NOT_PERMITTED,
  MEMBERSHIP_NOT_FOUND,
  MEMBERSHIP_NOT_PERMITTED,
  NO_ACTIVE_BRANCH,
  NO_ACTIVE_BRANCH_SEEN,
  NO_ACTIVE_ROLE,
  REQUESTED_ACCESS_DESCRIPTION,
  ROLES_CAPPED,
  ROLES_NOT_PERMITTED,
} from '../approval-copy';
import { ReadFailed } from './request-facts';

/** Each read as the page settled it; `null`: the holder lacks its code, so nothing was read. */
interface RequestedAccessProps {
  userName: string;
  membership: Loaded<MembershipSummary | null> | null;
  /** One page of the user's ACTIVE role assignments (Ruling 8). */
  roles: Loaded<Page<RoleAssignment>> | null;
  /** 10's bounded scan of their ACTIVE branch assignments. */
  scan: Loaded<UserBranchScan> | null;
  roleIndex: ReadonlyMap<string, RoleIndexEntry>;
  branchIndex: ReadonlyMap<string, { name: string; code: string }>;
  /** A selected branch narrows the scan to itself (BG-03). */
  selectedBranch: { name: string } | null;
  /** The signed-in user can switch to All branches (two ACTIVE branches, 08's PF1). */
  canSwitch: boolean;
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
  membership: Loaded<MembershipSummary | null> | null,
  show: (found: MembershipSummary) => string,
): ReactNode {
  if (membership === null) return MEMBERSHIP_NOT_PERMITTED;
  if (!membership.ok) return <ReadFailed problem={membership.problem} />;
  return membership.value ? show(membership.value) : MEMBERSHIP_NOT_FOUND;
}

/** The access a pending user gets once approved (spec §10.6): the membership's type and primary
 * branch, their roles (one page, capped and said so) and their branches (10's bounded scan, said
 * partial when it is). A read that failed says so, never "none" (rule 9). Server-Component safe. */
export function RequestedAccess({
  userName,
  membership,
  roles,
  scan,
  roleIndex,
  branchIndex,
  selectedBranch,
  canSwitch,
}: RequestedAccessProps) {
  const branchName = (id: string) => {
    const branch = branchIndex.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  return (
    <SectionCard title="Requested access" description={REQUESTED_ACCESS_DESCRIPTION}>
      <DescriptionList
        items={[
          {
            label: 'Membership type',
            value: membershipFact(membership, (found) => humanizeEnum(found.type)),
          },
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
          {NO_ACTIVE_ROLE}
        </Typography>
      ) : (
        <>
          {roles.value.page.hasNext && (
            <Box sx={{ px: 4, py: 2 }}>
              <Alert severity="info" role="note">
                {ROLES_CAPPED}
              </Alert>
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
      {scan === null ? (
        <Typography variant="body2" sx={MUTED_SX}>
          {BRANCHES_NOT_PERMITTED}
        </Typography>
      ) : !scan.ok ? (
        <ErrorState problem={scan.problem} />
      ) : (
        <>
          {(selectedBranch !== null || scan.value.truncated) && (
            <Box sx={{ px: 4, py: 2, display: 'grid', gap: 2 }}>
              {selectedBranch && (
                <Alert severity="info" role="note">
                  {branchContextNote(selectedBranch.name, canSwitch)}
                </Alert>
              )}
              {scan.value.truncated && (
                <Alert severity="info" role="note">
                  {PARTIAL_SCAN_NOTE}
                </Alert>
              )}
            </Box>
          )}
          {scan.value.items.length === 0 ? (
            <Typography variant="body2" sx={MUTED_SX}>
              {/* A selected branch narrows the scan and a capped scan hides rows, so "none" would be
                  a guess under the note saying so (rule 9; 10's branchAssignmentsEmptyState). */}
              {selectedBranch === null && !scan.value.truncated
                ? NO_ACTIVE_BRANCH
                : NO_ACTIVE_BRANCH_SEEN}
            </Typography>
          ) : (
            <UserBranchAssignmentsTable
              userName={userName}
              canRevoke={false}
              rows={scan.value.items.map((row) => {
                const branch = branchIndex.get(row.branchId);
                return {
                  assignmentId: row.id,
                  branchName: branch?.name ?? shortId(row.branchId),
                  branchCode: branch?.code ?? null,
                  assignmentType: row.assignmentType,
                };
              })}
            />
          )}
        </>
      )}
    </SectionCard>
  );
}
