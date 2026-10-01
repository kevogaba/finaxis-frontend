import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
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
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { ROLE_STATUSES } from '@/modules/administration/roles/role-contract';
import { parseRoleListQuery } from '@/modules/administration/roles/role-query';
import { canCreateRole } from '@/modules/administration/roles/role-rules';
import { listRoles } from '@/modules/administration/roles/role-service';
import { RoleDirectoryTable } from '@/modules/administration/roles/components/role-directory-table';

export const metadata: Metadata = { title: 'Roles & permissions' };

const PATH = '/admin/roles';

interface RolesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RolesPage({ searchParams }: RolesPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseRoleListQuery(params);
  const [roles, selected] = await Promise.all([load(listRoles(query)), getCurrentContextProfile()]);
  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Roles & permissions"
      description="Reusable permission bundles, and who holds them institution-wide or at one branch."
      actions={
        canCreateRole({ permissions }) ? (
          <Button
            component={NextLink}
            href={`${PATH}/new`}
            variant="contained"
            startIcon={<AddOutlined />}
          >
            Create role
          </Button>
        ) : undefined
      }
    />
  );

  if (!roles.ok) {
    return (
      <>
        {header}
        <Paper>
          {roles.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={roles.problem} />
          )}
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(roles.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = roles.value.page.totalItems;
  const hasFilters = Boolean(query.q ?? query.status ?? query.type);

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            // No datetime field here, so the zone is unused: no `GET /tenant` read for it.
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'role' : 'roles'}`}
            fields={[
              { kind: 'search', name: 'q', label: 'Search', placeholder: 'Code or name' },
              {
                kind: 'select',
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: ROLE_STATUSES.map((status) => ({
                  value: status,
                  label: humanizeEnum(status),
                })),
              },
              {
                kind: 'select',
                name: 'type',
                label: 'Type',
                allLabel: 'All types',
                options: [
                  { value: 'system', label: 'System role' },
                  { value: 'custom', label: 'Custom role' },
                ],
              },
            ]}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {roles.value.items.length === 0 ? (
              <EmptyState
                title="No roles"
                description={hasFilters ? 'No roles match these filters.' : 'No roles exist yet.'}
              />
            ) : (
              <RoleDirectoryTable
                roles={roles.value.items}
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
            <TablePaginationBar page={roles.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
