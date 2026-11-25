import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ownAccessBlocked, permissionHolder } from '@/auth/permissions';
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
  canAssignRoleInstitutionWide,
  isAssignmentRevocable,
  roleAssignmentBranchIds,
  SCOPED_ROLE_ASSIGNMENTS_NOTE,
  scopedRoleAssignmentView,
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
  const holder = permissionHolder(resolved?.profile);
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const branchLabel = (id: string) => {
    const branch = branches.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  // BG-03: each branch where the holder may assign, whichever branch is selected; institution scope
  // only with a tenant-wide grant.
  const branchOptions = roleAssignmentBranchIds(holder, branches.keys()).map((id) => ({
    id,
    label: branchLabel(id),
  }));
  const institution = canAssignRoleInstitutionWide(holder);
  const assignable = canAssignRole(record, holder) && (institution || branchOptions.length > 0);

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
            institution={institution}
            // Only a tenant administrator may assign themselves (#342).
            excludeUserId={ownAccessBlocked(true, holder) ? resolved?.profile.user_id : undefined}
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
  const rows = assignments.value.items.map((row) => ({
    assignmentId: row.id,
    name: byId.get(row.userId)?.displayName ?? shortId(row.userId),
    email: byId.get(row.userId)?.email ?? null,
    scopeType: row.scopeType,
    branchLabel: row.branchId
      ? (branches.get(row.branchId)?.name ?? shortId(row.branchId))
      : 'All branches',
    self: row.userId === myUserId,
    revocable: isAssignmentRevocable(row, holder),
  }));

  // BG-03: a branch-scoped view lists only its branches' BRANCH-scope rows, so it says so, and
  // "nobody" would be a guess.
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
      {assignments.value.items.length === 0 ? (
        <EmptyState
          title={scoped ? 'No assignment you can view' : 'Nobody holds this role'}
          description={
            assignable
              ? 'Assign it to give a user its permissions.'
              : scoped
                ? 'It may be held at institution level or at branches you can’t view.'
                : 'No one is assigned this role.'
          }
        />
      ) : (
        <>
          <RoleAssignmentsTable
            roleName={record.roleName}
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
