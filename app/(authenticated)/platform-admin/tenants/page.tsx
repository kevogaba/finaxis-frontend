import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
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
import { isPlatformOrganisation } from '@/config/application-context';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { TenantDirectoryTable } from '@/modules/platform-administration/tenants/components/tenant-directory-table';
import { TENANT_STATUSES } from '@/modules/platform-administration/tenants/tenant-contract';
import {
  hasTenantFilters,
  parseTenantListQuery,
} from '@/modules/platform-administration/tenants/tenant-query';
import {
  countryOptions,
  visibleTenantTotal,
  withCurrent,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { listTenants } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'SACCO institutions' };

const PATH = '/platform-admin/tenants';

interface TenantDirectoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TenantDirectoryPage({ searchParams }: TenantDirectoryPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseTenantListQuery(params);
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };

  const header = (
    <PageHeader
      eyebrow="Platform administration"
      title="SACCO institutions"
      description="Create, approve, monitor, suspend or deprovision tenant organisations."
      actions={
        // The code pre-check and the redirect after create both read the directory (BG-31).
        canAll(holder, ['tenant.create', 'tenant.view']) ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create tenant draft
          </Button>
        ) : undefined
      }
    />
  );

  if (!can(holder, 'tenant.view')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  const tenants = await load(listTenants(query));
  if (!tenants.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={tenants.problem} />
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(tenants.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  // BG-29: the list includes the reserved platform organisation, which is no institution.
  const rows = tenants.value.items.filter((tenant) => !isPlatformOrganisation(tenant.id));
  const filtered = hasTenantFilters(query);
  const total = visibleTenantTotal(
    tenants.value.page.totalItems,
    filtered,
    rows.length < tenants.value.items.length,
  );
  // A country from the URL is applied, so it must stay selectable (not render as "All"); a
  // non-canonical one (DD) is labelled by its code, not as the country it aliases.
  const countries = withCurrent(countryOptions(), query.country);

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'institution' : 'institutions'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: TENANT_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'country',
                label: 'Country',
                allLabel: 'All countries',
                options: countries,
              },
              { kind: 'datetime', name: 'createdFrom', label: 'Created from' },
              { kind: 'datetime', name: 'createdTo', label: 'Created to', endOfMinute: true },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {rows.length === 0 ? (
              <EmptyState
                title="No institutions"
                description={
                  filtered
                    ? 'No institutions match these filters.'
                    : 'No institutions have been created yet.'
                }
              />
            ) : (
              <TenantDirectoryTable
                tenants={rows}
                sort={query.sort}
                sortHref={(field) =>
                  hrefWith(PATH, params, {
                    sortBy: field,
                    sortDir: query.sort.by === field && query.sort.dir === 'ASC' ? 'DESC' : 'ASC',
                    page: null,
                  })
                }
              />
            )}
            <TablePaginationBar page={tenants.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
