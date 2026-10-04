import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar } from '@/components/data-display/list-toolbar';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  BRANCH_STATUSES,
  BRANCH_TYPE_SUGGESTIONS,
} from '@/modules/administration/branches/branch-contract';
import { parseBranchListQuery } from '@/modules/administration/branches/branch-query';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { BranchDirectoryTable } from '@/modules/administration/branches/components/branch-directory-table';
import { institutionBranchesHref } from '@/modules/platform-administration/branches/institution-branch-query';
import {
  BRANCHES_DESCRIPTION,
  canCreateInstitutionBranch,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import { listInstitutionBranches } from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Branches' };

interface BranchesTabProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** An institution's branches (spec §11.2): the hero is the layout's, so the list sits in one card. */
export default async function BranchesTab({ params, searchParams }: BranchesTabProps) {
  const tenantId = parseInstitutionId((await params).tenantId);
  if (!tenantId) notFound(); // rule 7: before any read
  const path = institutionBranchesHref(tenantId);

  const urlParams = toSearchParams(await searchParams);
  const query = parseBranchListQuery(urlParams);
  const [tenant, selected, branches] = await Promise.all([
    // The layout's cached read: if it failed, the layout renders that failure, not this tab.
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
    load(listInstitutionBranches(tenantId, query)),
  ]);
  if (!tenant.ok) return null;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };

  const draftButton = canCreateInstitutionBranch(tenant.value.status, holder) ? (
    <Button
      component={NextLink}
      href={`${path}/new`}
      variant="contained"
      startIcon={<AddOutlined />}
    >
      Create branch draft
    </Button>
  ) : undefined;

  if (!branches.ok) {
    return (
      <SectionCard title="Branches" description={BRANCHES_DESCRIPTION} actions={draftButton}>
        {branches.problem.code === 'forbidden' ? (
          <ForbiddenState />
        ) : (
          <ErrorState problem={branches.problem} />
        )}
      </SectionCard>
    );
  }

  const redirectPage = lastPageIfPastEnd(branches.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(path, urlParams, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = branches.value.page.totalItems;
  // A free-text type from the URL is applied, so it must stay selectable (not render as "All").
  const typeOptions = [
    ...new Set([...BRANCH_TYPE_SUGGESTIONS, ...(query.type ? [query.type] : [])]),
  ].map((type) => ({ value: type, label: branchTypeLabel(type) }));
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <SectionCard title="Branches" description={BRANCHES_DESCRIPTION} actions={draftButton}>
      <ListNavigationProvider>
        <Box sx={{ position: 'relative' }}>
          <ListToolbar
            timeZone="UTC"
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
                    : 'This institution has no branches yet.'
                }
              />
            ) : (
              <BranchDirectoryTable
                branches={branches.value.items}
                sort={query.sort}
                timeZone="UTC"
                basePath={path}
                createdLabel="Created (UTC)"
                // 10's NAME_MAX_WIDTH: at 375 px a 320 px name runs past the card's edge.
                nameMaxWidth="min(320px, 60vw)"
                sortHref={(field) =>
                  hrefWith(path, urlParams, {
                    sortBy: field,
                    sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
                    page: null,
                  })
                }
              />
            )}
            <TablePaginationBar page={branches.value.page} />
          </ListBusyRegion>
        </Box>
      </ListNavigationProvider>
    </SectionCard>
  );
}
