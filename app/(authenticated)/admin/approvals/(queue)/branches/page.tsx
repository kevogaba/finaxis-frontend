import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { permissionHolder } from '@/auth/permissions';
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
  NO_BRANCHES_WAITING,
} from '@/modules/administration/approvals/approval-copy';
import {
  BRANCH_QUEUE_HREF,
  BRANCH_QUEUE_LABEL,
  canSeeBranchActivations,
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

/** The Branch activation tab (spec §10.6): branches PENDING_APPROVAL, sortable, paged in the URL,
 * for a tenant-wide approver whichever branch is selected (BG-03). */
export default async function BranchActivationPage({ searchParams }: BranchActivationPageProps) {
  const params = toSearchParams(await searchParams);
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  // The description names a list and its count, so a card that can't show them leaves it out.
  const card = (content: ReactNode, description?: string) => (
    <SectionCard title={BRANCH_QUEUE_LABEL} description={description}>
      {content}
    </SectionCard>
  );
  if (!canSeeBranchActivations(holder)) {
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
    if (branches.problem.code === 'forbidden') return card(<ForbiddenState />);
    return card(<ErrorState problem={branches.problem} />, BRANCH_QUEUE_DESCRIPTION);
  }
  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(BRANCH_QUEUE_HREF, params, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  return card(
    <>
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
    BRANCH_QUEUE_DESCRIPTION,
  );
}
