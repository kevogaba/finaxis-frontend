import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar } from '@/components/data-display/list-toolbar';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  BRANCH_STATUSES,
  BRANCH_TYPE_SUGGESTIONS,
} from '@/modules/administration/branches/branch-contract';
import { parseBranchListQuery } from '@/modules/administration/branches/branch-query';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { BranchDirectoryTable } from '@/modules/administration/branches/components/branch-directory-table';

export const metadata: Metadata = { title: 'Branches' };

const PATH = '/admin/branches';

interface BranchesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchesPage({ searchParams }: BranchesPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseBranchListQuery(params);
  const [branches, selected, timeZone] = await Promise.all([
    load(listBranches(query)),
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Branches"
      description="Operating locations, their lifecycle, and who is assigned to each."
      actions={
        can({ permissions }, 'branch.create') ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create branch
          </Button>
        ) : undefined
      }
    />
  );

  if (!branches.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={branches.problem} />
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = branches.value.page.totalItems;
  // A free-text type from the URL is applied, so it must stay selectable (not render as "All").
  // ponytail: only the two platform types are offered (Ruling 15); upgrade: a freeSolo type filter.
  const typeOptions = [
    ...new Set([...BRANCH_TYPE_SUGGESTIONS, ...(query.type ? [query.type] : [])]),
  ].map((type) => ({ value: type, label: branchTypeLabel(type) }));
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            timeZone={timeZone}
            resultLabel={`${total} ${total === 1 ? 'branch' : 'branches'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: BRANCH_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'type',
                label: 'Type',
                allLabel: 'All types',
                options: typeOptions,
              },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {branches.value.items.length === 0 ? (
              <EmptyState
                title="No branches"
                description={
                  hasFilters
                    ? 'No branches match these filters.'
                    : 'No branches have been created yet.'
                }
              />
            ) : (
              <BranchDirectoryTable
                branches={branches.value.items}
                sort={query.sort}
                timeZone={timeZone}
                sortHref={(field) =>
                  hrefWith(PATH, params, {
                    sortBy: field,
                    sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
                    page: null,
                  })
                }
              />
            )}
            <TablePaginationBar page={branches.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
