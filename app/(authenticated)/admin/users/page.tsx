import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar, type ToolbarField } from '@/components/data-display/list-toolbar';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { UserDirectoryTable } from '@/modules/administration/users/components/user-directory-table';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from '@/modules/administration/users/user-contract';
import { hasUserFilters, parseUserListQuery } from '@/modules/administration/users/user-query';
import { listUsers } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'Users & access' };

const PATH = '/admin/users';

const FIELDS: ToolbarField[] = [
  { kind: 'search', name: 'q', label: 'Search', placeholder: 'Name, username or email' },
  {
    kind: 'select',
    name: 'userStatus',
    label: 'User status',
    allLabel: 'All user statuses',
    options: USER_STATUSES.map((value) => ({ value, label: humanizeEnum(value) })),
  },
  {
    kind: 'select',
    name: 'membershipStatus',
    label: 'Membership',
    allLabel: 'All memberships',
    options: MEMBERSHIP_STATUSES.map((value) => ({ value, label: humanizeEnum(value) })),
  },
];

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseUserListQuery(params);
  const users = await load(listUsers(query));

  // "Invite user" is layer 11's (`/admin/users/new`).
  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Users & access"
      description="Everyone with a membership in this institution: their onboarding, status and access."
    />
  );

  if (!users.ok) {
    return (
      <>
        {header}
        <Paper>
          {users.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={users.problem} />
          )}
        </Paper>
      </>
    );
  }

  const redirectPage = lastPageIfPastEnd(users.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(PATH, params, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = users.value.page.totalItems;

  return (
    <>
      {header}
      <ListNavigationProvider>
        <Paper sx={{ overflow: 'hidden', position: 'relative' }}>
          <ListToolbar
            // No datetime field here, so the zone is unused: no `GET /tenant` read for it.
            timeZone="UTC"
            resultLabel={`${total} ${total === 1 ? 'user' : 'users'}`}
            fields={FIELDS}
          />
          <ListNavigationProgress />
          <ListBusyRegion>
            {users.value.items.length === 0 ? (
              <EmptyState
                title="No users"
                description={
                  hasUserFilters(query)
                    ? 'No users match these filters.'
                    : 'No one has been invited yet.'
                }
              />
            ) : (
              <UserDirectoryTable users={users.value.items} />
            )}
            <TablePaginationBar page={users.value.page} />
          </ListBusyRegion>
        </Paper>
      </ListNavigationProvider>
    </>
  );
}
