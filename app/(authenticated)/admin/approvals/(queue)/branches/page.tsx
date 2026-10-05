import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { SwitchToAllBranchesButton } from '@/components/context/switch-to-all-branches-button';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { parseListSort } from '@/lib/api/list-sort';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_QUEUE_DESCRIPTION,
  branchQueueContextNote,
  NO_BRANCHES_WAITING,
} from '@/modules/administration/approvals/approval-copy';
import {
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_HREF,
  BRANCH_QUEUE_LABEL,
} from '@/modules/administration/approvals/approval-rules';
import { listBranchActivations } from '@/modules/administration/approvals/approval-service';
import { BRANCH_SORT_FIELDS } from '@/modules/administration/branches/branch-contract';
import {
  DEFAULT_BRANCH_PAGE_SIZE,
  DEFAULT_BRANCH_SORT,
} from '@/modules/administration/branches/branch-query';
import { BranchDirectoryTable } from '@/modules/administration/branches/components/branch-directory-table';

export const metadata: Metadata = { title: 'Branch activation' };

/** 10's `NAME_MAX_WIDTH`: a long name's ellipsis stays inside a 375 px card. */
const NAME_MAX_WIDTH = 'min(320px, 60vw)';

interface BranchActivationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The Branch activation tab (spec §10.6): branches PENDING_APPROVAL, sortable, paged in the URL.
 * The list isn't branch-restricted, but activating needs All branches (BG-03, Ruling 11). */
export default async function BranchActivationPage({ searchParams }: BranchActivationPageProps) {
  const params = toSearchParams(await searchParams);
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const card = (content: ReactNode) => (
    <SectionCard title={BRANCH_QUEUE_LABEL} description={BRANCH_QUEUE_DESCRIPTION}>
      {content}
    </SectionCard>
  );
  if (!canAll(holder, BRANCH_ACTIVATION_CODES)) {
    return card(<ForbiddenState description={BRANCH_ACTIVATION_FORBIDDEN} />);
  }

  const query = {
    ...parsePaging(params, DEFAULT_BRANCH_PAGE_SIZE),
    sort: parseListSort(params, BRANCH_SORT_FIELDS, DEFAULT_BRANCH_SORT),
  };
  const [branches, timeZone] = await Promise.all([
    load(listBranchActivations(query)),
    getOrganisationTimeZone(),
  ]);
  if (!branches.ok) {
    return card(
      branches.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={branches.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(BRANCH_QUEUE_HREF, params, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  const selectedBranch = resolved?.context.branch ?? null;
  // PF1 (08): /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
  const canSwitch =
    (resolved?.profile.branches.filter((entry) => entry.status === 'ACTIVE').length ?? 0) > 1;

  return card(
    <>
      {selectedBranch && (
        <Box sx={{ px: 4, py: 3 }}>
          {/* role="note": a static notice, not an alert announced on every visit. */}
          <Alert severity="info" role="note">
            {branchQueueContextNote(selectedBranch.name, canSwitch)}
            {canSwitch && (
              <Box sx={{ mt: 2, width: 'fit-content' }}>
                <SwitchToAllBranchesButton />
              </Box>
            )}
          </Alert>
        </Box>
      )}
      {branches.value.items.length === 0 ? (
        <EmptyState title={NO_BRANCHES_WAITING} />
      ) : (
        <BranchDirectoryTable
          branches={branches.value.items}
          sort={query.sort}
          timeZone={timeZone}
          basePath={BRANCH_QUEUE_HREF}
          nameMaxWidth={NAME_MAX_WIDTH}
          sortHref={(field) =>
            hrefWith(BRANCH_QUEUE_HREF, params, {
              sortBy: field,
              sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
              page: null,
            })
          }
        />
      )}
      <TablePaginationBar page={branches.value.page} />
    </>,
  );
}
