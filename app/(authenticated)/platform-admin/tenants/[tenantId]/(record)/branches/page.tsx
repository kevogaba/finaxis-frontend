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
  activateBlocked,
  branchCheckerNote,
  canCheckBranches,
  checkerBranchActions,
  checkerWindow,
  type CheckerWindow,
} from '@/modules/platform-administration/checker/checker-rules';
import { readActiveBranches } from '@/modules/platform-administration/checker/checker-service';
import { CheckerNote } from '@/modules/platform-administration/checker/components/checker-note';
import { BranchCheckerActions } from '@/modules/platform-administration/checker/components/checker-row-actions';
import {
  BRANCHES_DESCRIPTION,
  canCreateInstitutionBranch,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import { listInstitutionBranches } from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Branches' };

/** The institution (the layout's cached read) and the caller, then ADR 0028's window from one
 * bounded read, made only for a holder who could act on it (`active` null otherwise). */
async function readBranchWindow(tenantId: string) {
  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];
  const active =
    tenant.ok && canCheckBranches(tenant.value.status, { permissions })
      ? await load(readActiveBranches(tenantId))
      : null;
  return { tenant, selected, active };
}

interface BranchesTabProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** An institution's branches (spec §11.2): the hero is the layout's, so the list sits in one card.
 * While the institution has no active branch besides its head office, a platform administrator
 * submits, returns and activates its branches here (BG-02). */
export default async function BranchesTab({ params, searchParams }: BranchesTabProps) {
  const tenantId = parseInstitutionId((await params).tenantId);
  if (!tenantId) notFound(); // rule 7: before any read
  const path = institutionBranchesHref(tenantId);

  const urlParams = toSearchParams(await searchParams);
  const query = parseBranchListQuery(urlParams);
  // The window's read needs the institution and the caller, so it follows them, beside the list
  // read: neither waits on the other.
  const [{ tenant, selected, active }, branches] = await Promise.all([
    readBranchWindow(tenantId),
    load(listInstitutionBranches(tenantId, query)),
  ]);
  // The layout renders the institution's failure and drops this tab; this shows only when the two
  // reads (the layout's, keyed by the URL as typed, and this one, lower-cased) disagree.
  if (!tenant.ok) {
    return (
      <SectionCard title="Branches" description={BRANCHES_DESCRIPTION}>
        <ErrorState problem={tenant.problem} />
      </SectionCard>
    );
  }
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const callerId = resolved?.profile.user_id ?? null;
  const tenantStatus = tenant.value.status;
  const checking = active !== null;
  // A failed window read leaves the actions offered: the platform's named 409 explains a closed one.
  const opening: CheckerWindow = active?.ok ? checkerWindow(active.value) : 'unknown';

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
  // Each row's actions; the column shows only when a row has one.
  const checkerRows = new Map(
    (checking ? branches.value.items : []).flatMap((branch) => {
      const actions = checkerBranchActions(branch, {
        tenantStatus,
        window: opening,
        holder,
        callerId,
      });
      return actions.length > 0 ? [[branch.id, actions] as const] : [];
    }),
  );
  // A free-text type from the URL is applied, so it must stay selectable (not render as "All").
  const typeOptions = [
    ...new Set([...BRANCH_TYPE_SUGGESTIONS, ...(query.type ? [query.type] : [])]),
  ].map((type) => ({ value: type, label: branchTypeLabel(type) }));
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <SectionCard title="Branches" description={BRANCHES_DESCRIPTION} actions={draftButton}>
      {checking && (
        <CheckerNote note={branchCheckerNote(tenant.value.displayName, opening, tenantStatus)} />
      )}
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
                rowActions={
                  checkerRows.size > 0
                    ? (branch) => {
                        const actions = checkerRows.get(branch.id);
                        return (
                          actions && (
                            <BranchCheckerActions
                              tenantId={tenantId}
                              branchId={branch.id}
                              name={branch.branchName}
                              actions={actions}
                              activateBlocked={activateBlocked(branch, callerId)}
                              contextOrganisationId={resolved?.context.organization.id}
                            />
                          )
                        );
                      }
                    : undefined
                }
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
