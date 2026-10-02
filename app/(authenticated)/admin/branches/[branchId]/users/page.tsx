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
import { getTenantUser } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import {
  canAssignUsers,
  canRevokeAssignments,
} from '@/modules/administration/branches/branch-rules';
import { getBranch, listBranchAssignments } from '@/modules/administration/branches/branch-service';
import { AssignBranchUserButton } from '@/modules/administration/branches/components/branch-user-actions';
import { BranchUsersTable } from '@/modules/administration/branches/components/branch-users-table';

export const metadata: Metadata = { title: 'Branch users' };

interface BranchUsersPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchUsersPage({ params, searchParams }: BranchUsersPageProps) {
  const { branchId } = await params;
  const query = toSearchParams(await searchParams);
  const [branch, assignments, selected] = await Promise.all([
    load(getBranch(branchId)),
    load(listBranchAssignments(branchId, parsePaging(query, 10))),
    getCurrentContextProfile(),
  ]);
  if (!branch.ok) return null; // the layout renders the failure or the guided state
  const record = branch.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const canAssign = canAssignUsers(record.status, holder);
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId =
    selected.kind === 'resolved' ? selected.context.organization.id : undefined;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Branch users"
      description="Active assignments at this branch. Assignment types are labels; roles grant permissions."
      actions={
        canAssign ? (
          <AssignBranchUserButton
            branchId={branchId}
            branchName={record.branchName}
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
      hrefWith(`/admin/branches/${branchId}/users`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  // ponytail: one cached read per distinct visible user (≤ page size, BG-09 — assignment items
  // carry no names).
  const users = await Promise.all(
    [...new Set(assignments.value.items.map((row) => row.userId))].map((id) => getTenantUser(id)),
  );
  const byId = new Map(users.flatMap((user) => (user ? [[user.id, user] as const] : [])));

  return card(
    <>
      {assignments.value.items.length === 0 ? (
        <EmptyState
          title="No users assigned"
          description={
            canAssign
              ? 'Assign users so they can work in this branch.'
              : 'No users are assigned to this branch.'
          }
        />
      ) : (
        <BranchUsersTable
          canRevoke={canRevokeAssignments(holder)}
          rows={assignments.value.items.map((row) => ({
            assignmentId: row.id,
            name: byId.get(row.userId)?.displayName ?? shortId(row.userId),
            email: byId.get(row.userId)?.email ?? null,
            assignmentType: row.assignmentType,
          }))}
          contextOrganisationId={contextOrganisationId}
        />
      )}
      <TablePaginationBar page={assignments.value.page} />
    </>,
  );
}
