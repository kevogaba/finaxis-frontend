import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { withViews } from '@/auth/permission-views';
import { canActAtBranch, canAllTenantWide, permissionHolder } from '@/auth/permissions';
import { BlockedButton } from '@/components/data-display/blocked-button';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { shortId } from '@/lib/format';
import { scopedBranchView } from '@/modules/administration/branches/branch-rules';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { AssignUserBranchButton } from '@/modules/administration/users/components/user-branch-actions';
import { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import {
  branchAssignmentsEmptyState,
  canAssignUserBranch,
  OWN_ACCESS,
  ownAccessBlocked,
  pageOfItems,
  PARTIAL_SCAN_NOTE,
  parseUserId,
  SCOPED_ASSIGNMENTS_NOTE,
  scopedAssignmentView,
  type SelectOption,
} from '@/modules/administration/users/user-rules';
import { getUser, listUserBranchAssignments } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User branch assignments' };

const DESCRIPTION =
  'Branches this user can work in. Assignment types are labels; roles grant permissions.';
const BRANCHES_UNAVAILABLE =
  "Branches couldn't be loaded, so none can be assigned right now. Refresh to try again.";

interface UserBranchesPageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UserBranchesPage({ params, searchParams }: UserBranchesPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7: before any read, like the layout (16's tab pages)
  const query = toSearchParams(await searchParams);
  const [user, selected, scan, branches] = await Promise.all([
    load(getUser(userId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listUserBranchAssignments(userId)),
    getBranchIndex(), // empty without branch.view: names fall back to short ids
  ]);
  if (!user.ok) return null; // the layout renders the failure

  const record = user.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  const self = record.id === resolved?.profile.user_id;
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const canAssign = canAssignUserBranch(record.membershipStatus, holder, self);
  // Your own record (#342): shown disabled with the reason, like the access tab's Assign role.
  const ownBlocked =
    ownAccessBlocked(self, holder) && canAssignUserBranch(record.membershipStatus, holder, false);
  // ACTIVE branches only (an inactive one is a 409). A tenant-wide grant assigns at any of them; a
  // branch-scoped one at the branches it is held at, whichever branch is selected (BG-03), which
  // `/auth/me` lists ACTIVE only.
  // ponytail: one page of 100 ACTIVE branches; past it the rest aren't offered and the drawer says
  // so (AGENTS.md's fifth exception; Ruling 11).
  const anywhere = canAllTenantWide(holder, withViews(['user.assign_branch']));
  const active =
    canAssign && anywhere
      ? await load(
          listBranches({
            status: 'ACTIVE',
            sort: { by: 'branchName', dir: 'ASC' },
            page: 0,
            size: 100,
          }),
        )
      : null;
  const branchLabel = (id: string) => {
    const branch = branches.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  const options: SelectOption[] = anywhere
    ? active?.ok
      ? active.value.items.map((branch) => ({
          id: branch.id,
          label: `${branch.branchName} (${branch.branchCode})`,
        }))
      : []
    : (holder.branchPermissions['user.assign_branch'] ?? [])
        .filter((id) => canActAtBranch(holder, 'user.assign_branch', id))
        .map((id) => ({ id, label: branchLabel(id) }))
        .sort((a, b) => a.label.localeCompare(b.label));
  const assignOffered = canAssign && options.length > 0;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Branch assignments"
      // A failed branch read must not look like "no branch to assign": say so (and how to retry).
      description={active && !active.ok ? `${DESCRIPTION} ${BRANCHES_UNAVAILABLE}` : DESCRIPTION}
      actions={
        assignOffered ? (
          <AssignUserBranchButton
            userId={userId}
            userName={record.displayName}
            branches={options}
            truncated={active?.ok === true && active.value.page.hasNext}
            // The ACTIVE list is `GET /branches`' answer: only the branches a branch-scoped
            // `branch.view` covers (BG-03).
            scoped={anywhere && scopedBranchView(holder)}
            contextOrganisationId={contextOrganisationId}
          />
        ) : ownBlocked ? (
          <BlockedButton label="Assign branch" reason={OWN_ACCESS} startIcon={<AddOutlined />} />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!scan.ok) {
    return card(
      scan.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={scan.problem} />
      ),
    );
  }

  // The scan reads every page of the user's rows (BG-09), so they are paged here, on the server, with the page
  // and size in the URL like every other list. Branch name, then type, then id: a total order, since
  // the scan's own order is unspecified and a tie would move a row between pages.
  const rows = scan.value.items
    .map((row) => {
      const branch = branches.get(row.branchId);
      return {
        assignmentId: row.id,
        branchName: branch?.name ?? shortId(row.branchId),
        branchCode: branch?.code ?? null,
        assignmentType: row.assignmentType,
        // On the row's own branch, which `/auth/me` lists only while it is ACTIVE (BG-03, #242).
        revocable: canActAtBranch(holder, 'user.revoke_branch', row.branchId),
      };
    })
    .sort(
      (a, b) =>
        a.branchName.localeCompare(b.branchName) ||
        a.assignmentType.localeCompare(b.assignmentType) ||
        a.assignmentId.localeCompare(b.assignmentId),
    );
  const paged = pageOfItems(rows, parsePaging(query, 10));
  const redirectPage = lastPageIfPastEnd(paged.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/users/${userId}/branches`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  // BG-03: a search by user covers every branch to a tenant-wide view, its own branches otherwise.
  // Ruling 8: a user with more than 500 ACTIVE assignments caps the scan, which is then partial.
  const scoped = scopedAssignmentView(holder);
  const notices =
    scoped || scan.value.truncated ? (
      <Box sx={{ px: 4, py: 3, display: 'grid', gap: 2 }}>
        {/* role="note": static notices, not alerts announced on every visit to the tab (as the
            settings catalogue's, and distinct from the toast's alert). */}
        {scoped && (
          <Alert severity="info" role="note">
            {SCOPED_ASSIGNMENTS_NOTE}
          </Alert>
        )}
        {scan.value.truncated && (
          <Alert severity="info" role="note">
            {PARTIAL_SCAN_NOTE}
          </Alert>
        )}
      </Box>
    ) : null;

  return card(
    <>
      {notices}
      {paged.items.length === 0 ? (
        // With a branch-scoped view or a capped scan, "none" would be a guess under the note.
        <EmptyState
          {...branchAssignmentsEmptyState({
            scoped,
            truncated: scan.value.truncated,
            assignOffered,
          })}
        />
      ) : (
        <UserBranchAssignmentsTable
          userName={record.displayName}
          self={self}
          canRevoke={paged.items.some((row) => row.revocable)}
          contextOrganisationId={contextOrganisationId}
          rows={paged.items}
        />
      )}
      <TablePaginationBar page={paged.page} />
    </>,
  );
}
