import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { SwitchToAllBranchesButton } from '@/components/context/switch-to-all-branches-button';
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
import { canRevokeAssignments } from '@/modules/administration/branches/branch-rules';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { AssignUserBranchButton } from '@/modules/administration/users/components/user-branch-actions';
import { UserBranchAssignmentsTable } from '@/modules/administration/users/components/user-branch-assignments-table';
import {
  branchContextNote,
  canAssignUserBranch,
  pageOfItems,
  PARTIAL_SCAN_NOTE,
  parseUserId,
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
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  const selectedBranch = resolved?.context.branch ?? null;
  const canAssign = canAssignUserBranch(record.membershipStatus, holder);
  // ACTIVE branches only (an inactive one is a 409); with a branch selected, only that branch is
  // reachable (§E.4).
  // ponytail: one page of 100 ACTIVE branches; past it the rest aren't offered and the drawer says
  // so (AGENTS.md's fifth exception; Ruling 11).
  const active =
    canAssign && !selectedBranch
      ? await load(
          listBranches({
            status: 'ACTIVE',
            sort: { by: 'branchName', dir: 'ASC' },
            page: 0,
            size: 100,
          }),
        )
      : null;
  const selectedCode = selectedBranch ? branches.get(selectedBranch.id)?.code : undefined;
  const options: SelectOption[] = selectedBranch
    ? [
        {
          id: selectedBranch.id,
          label: selectedCode ? `${selectedBranch.name} (${selectedCode})` : selectedBranch.name,
        },
      ]
    : active?.ok
      ? active.value.items.map((branch) => ({
          id: branch.id,
          label: `${branch.branchName} (${branch.branchCode})`,
        }))
      : [];
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
            contextOrganisationId={contextOrganisationId}
          />
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

  // The scan has no user filter (BG-09), so its rows are paged here, on the server, with the page
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

  // PF1: /auth/me branches[] can include SUSPENDED branches, and All branches only helps with more
  // than one ACTIVE branch to switch between (the branch record layout's check).
  const canSwitch =
    (resolved?.profile.branches.filter((entry) => entry.status === 'ACTIVE').length ?? 0) > 1;
  // Ruling 8: the backend forces a scan to the selected branch, and a branch with more than 500
  // ACTIVE assignments is capped there too, so a capped scan is partial with or without a branch.
  const notices =
    selectedBranch || scan.value.truncated ? (
      <Box sx={{ px: 4, pt: 3, display: 'grid', gap: 2 }}>
        {selectedBranch && (
          <Alert severity="info">
            {branchContextNote(selectedBranch.name, canSwitch)}
            {canSwitch && (
              <Box sx={{ mt: 2 }}>
                <SwitchToAllBranchesButton />
              </Box>
            )}
          </Alert>
        )}
        {scan.value.truncated && <Alert severity="info">{PARTIAL_SCAN_NOTE}</Alert>}
      </Box>
    ) : null;

  return card(
    <>
      {notices}
      {paged.items.length === 0 ? (
        <EmptyState
          title="No branch assignments"
          description={
            assignOffered
              ? 'Assign a branch so they can work there.'
              : 'This user has no branch assignments.'
          }
        />
      ) : (
        <UserBranchAssignmentsTable
          userName={record.displayName}
          canRevoke={canRevokeAssignments(holder)}
          contextOrganisationId={contextOrganisationId}
          rows={paged.items}
        />
      )}
      <TablePaginationBar page={paged.page} />
    </>,
  );
}
