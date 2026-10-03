import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getRoleIndex } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import {
  canRevokeRoleAssignments,
  isAssignmentRevocable,
} from '@/modules/administration/roles/role-rules';
import { listRoleAssignments } from '@/modules/administration/roles/role-service';
import { AssignUserRoleButton } from '@/modules/administration/users/components/user-role-actions';
import { UserRoleAssignmentsTable } from '@/modules/administration/users/components/user-role-assignments-table';
import {
  ACCESS_DESCRIPTION,
  canAssignUserRole,
  NO_ACTIVE_ROLES,
  parseUserId,
  roleScopeBranches,
  roleScopeHint,
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
  const [user, selected, assignments, roles, branches] = await Promise.all([
    load(getUser(userId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRoleAssignments({ userId, status: 'ACTIVE' }, parsePaging(query, 10))),
    getRoleIndex(), // empty without role.view: names fall back to short ids
    getBranchIndex(), // empty without branch.view: names fall back to short ids
  ]);
  if (!user.ok) return null; // the layout renders the failure

  const record = user.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const selectedBranch = resolved?.context.branch ?? null;
  const branchLabel = (id: string) => {
    const branch = branches.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  // A DISABLED role grants nothing (BG-27): only ACTIVE roles are offered.
  const roleOptions = [...roles]
    .filter(([, role]) => role.status === 'ACTIVE')
    .map(([id, role]) => ({ id, label: `${role.name} (${role.code})` }));
  const canAssign = canAssignUserRole(record.membershipStatus, holder);
  // Branch scope needs the user's own ACTIVE assignment at that branch, else a 409.
  const scan =
    canAssign && can(holder, 'branch_assignment.view')
      ? await load(listUserBranchAssignments(userId))
      : null;
  const scopeBranches = scan?.ok
    ? roleScopeBranches(scan.value.items, selectedBranch?.id ?? null, branchLabel)
    : [];
  const branchHint = roleScopeHint({
    readable: scan?.ok ?? false,
    offered: scopeBranches.length,
    selectedBranchName: selectedBranch?.name ?? null,
  });
  const assignOffered = canAssign && roleOptions.length > 0;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Roles & access"
      description={canAssign && roleOptions.length === 0 ? NO_ACTIVE_ROLES : ACCESS_DESCRIPTION}
      actions={
        assignOffered ? (
          <AssignUserRoleButton
            userId={userId}
            userName={record.displayName}
            roles={roleOptions}
            branches={scopeBranches}
            branchHint={branchHint}
            contextOrganisationId={contextOrganisationId}
          />
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

  return card(
    assignments.value.items.length === 0 ? (
      <EmptyState
        title="No roles assigned"
        description={
          assignOffered ? 'Assign a role to give them permissions.' : 'This user holds no roles.'
        }
      />
    ) : (
      <>
        <UserRoleAssignmentsTable
          userName={record.displayName}
          self={record.id === resolved?.profile.user_id}
          canRevoke={canRevokeRoleAssignments(holder)}
          contextOrganisationId={contextOrganisationId}
          rows={assignments.value.items.map((row) => {
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
              revocable: isAssignmentRevocable(row, selectedBranch?.id ?? null),
            };
          })}
        />
        <TablePaginationBar page={assignments.value.page} />
      </>
    ),
  );
}
