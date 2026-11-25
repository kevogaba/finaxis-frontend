import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, permissionHolder } from '@/auth/permissions';
import { BlockedButton } from '@/components/data-display/blocked-button';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getRoleIndexScan, ROLE_INDEX_CEILING } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import {
  canAssignRoleAt,
  canAssignRoleInstitutionWide,
  isAssignmentRevocable,
  SCOPED_ROLE_ASSIGNMENTS_NOTE,
  scopedRoleAssignmentView,
} from '@/modules/administration/roles/role-rules';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import { AssignUserRoleButton } from '@/modules/administration/users/components/user-role-actions';
import { UserRoleAssignmentsTable } from '@/modules/administration/users/components/user-role-assignments-table';
import {
  ACCESS_DESCRIPTION,
  canAssignUserRole,
  NO_ACTIVE_ROLES,
  OWN_ACCESS,
  ownAccessBlocked,
  parseUserId,
  ROLES_UNAVAILABLE,
  roleScopeBranches,
  roleScopeHint,
  rolesCappedHint,
  rolesCappedNoneActive,
} from '@/modules/administration/users/user-rules';
import { getUser, listUserBranchAssignments } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User roles & access' };

interface UserAccessPageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UserAccessPage({ params, searchParams }: UserAccessPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7: before any read, like the layout (16's tab pages)
  const query = toSearchParams(await searchParams);
  const [user, selected, assignments, roleScan, branches] = await Promise.all([
    load(getUser(userId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRoleAssignments({ userId, status: 'ACTIVE' }, parsePaging(query, 10))),
    getRoleIndexScan(), // empty without role.view: names fall back to short ids
    getBranchIndex(), // empty without branch.view: names fall back to short ids
  ]);
  if (!user.ok) return null; // the layout renders the failure

  const { index: roles, truncated: rolesTruncated } = roleScan;
  const record = user.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  const self = record.id === resolved?.profile.user_id;
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const branchLabel = (id: string) => {
    const branch = branches.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  // A DISABLED role grants nothing (BG-27): only ACTIVE roles are offered.
  const roleOptions = [...roles]
    .filter(([, role]) => role.status === 'ACTIVE')
    .map(([id, role]) => ({ id, label: `${role.name} (${role.code})` }));
  const canAssign = canAssignUserRole(record.membershipStatus, holder, self);
  // Your own record (#342): offered to your codes, but only a tenant administrator may add to your
  // own access, so it shows disabled with the reason.
  const ownBlocked =
    ownAccessBlocked(self, holder) && canAssignUserRole(record.membershipStatus, holder, false);
  // Branch scope needs the user's own ACTIVE assignment at that branch, else a 409.
  const scan =
    canAssign && can(holder, 'branch_assignment.view')
      ? await load(listUserBranchAssignments(userId))
      : null;
  // BG-03: each of their branches where the holder may assign, whichever branch is selected;
  // institution scope only with a tenant-wide grant.
  const institution = canAssignRoleInstitutionWide(holder);
  const scopeBranches = scan?.ok
    ? roleScopeBranches(scan.value.items, (id) => canAssignRoleAt(holder, id), branchLabel)
    : [];
  const branchHint = roleScopeHint({
    readable: scan?.ok ?? false,
    offered: scopeBranches.length,
    truncated: scan?.ok === true && scan.value.truncated,
    someBranches: !institution,
  });
  // Without institution scope, no branch of theirs leaves nothing to assign: shown disabled, with
  // why.
  const noScope = !institution && scopeBranches.length === 0;
  const assignOffered = canAssign && roleOptions.length > 0 && !noScope;
  // The index holds the first ROLE_INDEX_CEILING roles by name: a capped scan is never presented as
  // the whole catalogue (AGENTS.md, the fifth paging exception), so the picker says so.
  const roleHint =
    assignOffered && rolesTruncated ? rolesCappedHint(ROLE_INDEX_CEILING) : undefined;
  // `getRoleIndexScan` answers an empty map on any failure and every tenant has system roles, so an
  // empty index means the read failed: never "there are no active roles". Past the ceiling, "none"
  // is only true of the roles that were read.
  const noRoleOffered =
    roles.size === 0
      ? ROLES_UNAVAILABLE
      : rolesTruncated
        ? rolesCappedNoneActive(ROLE_INDEX_CEILING)
        : NO_ACTIVE_ROLES;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Roles & access"
      description={canAssign && roleOptions.length === 0 ? noRoleOffered : ACCESS_DESCRIPTION}
      actions={
        assignOffered ? (
          <AssignUserRoleButton
            userId={userId}
            userName={record.displayName}
            roles={roleOptions}
            roleHint={roleHint}
            branches={scopeBranches}
            branchHint={branchHint}
            institution={institution}
            contextOrganisationId={contextOrganisationId}
          />
        ) : ownBlocked ? (
          <BlockedButton label="Assign role" reason={OWN_ACCESS} startIcon={<AddOutlined />} />
        ) : canAssign && roleOptions.length > 0 && noScope && branchHint ? (
          <BlockedButton label="Assign role" reason={branchHint} startIcon={<AddOutlined />} />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!assignments.ok) {
    return card(
      assignments.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={assignments.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(assignments.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/users/${userId}/access`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  const rows = assignments.value.items.map((row) => {
    const role = roles.get(row.roleId);
    return {
      assignmentId: row.id,
      roleName: role?.name ?? shortId(row.roleId),
      roleCode: role?.code ?? null,
      roleStatus: role?.status ?? null,
      scopeType: row.scopeType,
      branchLabel: row.branchId
        ? (branches.get(row.branchId)?.name ?? shortId(row.branchId))
        : 'All branches',
      revocable: isAssignmentRevocable(row, holder),
    };
  });
  // BG-03: a branch-scoped view lists only its branches' BRANCH-scope rows, so it says so, and "no
  // roles" would be a guess.
  const scoped = scopedRoleAssignmentView(holder);
  return card(
    <>
      {scoped && (
        <Box sx={{ px: 4, py: 3 }}>
          <Alert severity="info" role="note">
            {SCOPED_ROLE_ASSIGNMENTS_NOTE}
          </Alert>
        </Box>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title={scoped ? 'No role you can view' : 'No roles assigned'}
          description={
            assignOffered
              ? 'Assign a role to give them permissions.'
              : scoped
                ? 'They may hold roles at institution level or at branches you can’t view.'
                : 'This user holds no roles.'
          }
        />
      ) : (
        <>
          <UserRoleAssignmentsTable
            userName={record.displayName}
            self={self}
            canRevoke={rows.some((row) => row.revocable)}
            contextOrganisationId={contextOrganisationId}
            rows={rows}
          />
          <TablePaginationBar page={assignments.value.page} />
        </>
      )}
    </>,
  );
}
