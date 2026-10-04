import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getTenantUser } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import {
  assignmentsDescription,
  canAssignRole,
  canRevokeRoleAssignments,
  isAssignmentRevocable,
} from '@/modules/administration/roles/role-rules';
import { getRole, listRoleAssignments } from '@/modules/administration/roles/role-service';
import { AssignRoleButton } from '@/modules/administration/roles/components/role-assignment-actions';
import { RoleAssignmentsTable } from '@/modules/administration/roles/components/role-assignments-table';

export const metadata: Metadata = { title: 'Role assignments' };

interface RoleAssignmentsPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RoleAssignmentsPage({
  params,
  searchParams,
}: RoleAssignmentsPageProps) {
  const { roleId } = await params;
  const query = toSearchParams(await searchParams);
  const [role, selected, assignments, branches] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRoleAssignments({ roleId, status: 'ACTIVE' }, parsePaging(query, 10))),
    getBranchIndex(), // empty without branch.view: branch names fall back to short IDs
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const branchLabel = (id: string, name: string) => {
    const code = branches.get(id)?.code;
    return code ? `${name} (${code})` : name;
  };
  // Ruling 10: with a branch selected, a BRANCH assignment elsewhere is a 404 (contract §E.4).
  const selectedBranch = resolved?.context.branch ?? null;
  const branchOptions = selectedBranch
    ? [{ id: selectedBranch.id, label: branchLabel(selectedBranch.id, selectedBranch.name) }]
    : [...branches].map(([id, branch]) => ({ id, label: branchLabel(id, branch.name) }));
  const assignable = canAssignRole(record, holder);

  const card = (content: ReactNode) => (
    <SectionCard
      title="Assignments"
      description={assignmentsDescription(record, holder)}
      actions={
        assignable ? (
          <AssignRoleButton
            roleId={roleId}
            roleName={record.roleName}
            branches={branchOptions}
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
      hrefWith(`/admin/roles/${roleId}/assignments`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  // ponytail: one cached read per distinct visible user (≤ page size). Assignment rows carry no
  // names (BG-09), as on 08's Users tab.
  const users = await Promise.all(
    [...new Set(assignments.value.items.map((row) => row.userId))].map((id) => getTenantUser(id)),
  );
  const byId = new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));
  const myUserId = resolved?.profile.user_id ?? null;

  return card(
    assignments.value.items.length === 0 ? (
      <EmptyState
        title="Nobody holds this role"
        description={
          assignable ? 'Assign it to give a user its permissions.' : 'No one is assigned this role.'
        }
      />
    ) : (
      <>
        <RoleAssignmentsTable
          roleName={record.roleName}
          canRevoke={canRevokeRoleAssignments(holder)}
          contextOrganisationId={contextOrganisationId}
          rows={assignments.value.items.map((row) => ({
            assignmentId: row.id,
            name: byId.get(row.userId)?.displayName ?? shortId(row.userId),
            email: byId.get(row.userId)?.email ?? null,
            scopeType: row.scopeType,
            branchLabel: row.branchId
              ? (branches.get(row.branchId)?.name ?? shortId(row.branchId))
              : 'All branches',
            self: row.userId === myUserId,
            revocable: isAssignmentRevocable(row, selectedBranch?.id ?? null),
          }))}
        />
        <TablePaginationBar page={assignments.value.page} />
      </>
    ),
  );
}
