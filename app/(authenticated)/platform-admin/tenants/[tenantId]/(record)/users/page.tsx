import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { ListToolbar, type ToolbarField } from '@/components/data-display/list-toolbar';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { UserDirectoryTable } from '@/modules/administration/users/components/user-directory-table';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from '@/modules/administration/users/user-contract';
import { hasUserFilters, parseUserListQuery } from '@/modules/administration/users/user-query';
import { userStatusLabel } from '@/modules/administration/users/user-rules';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';
import { INSTITUTION_USERS_DESCRIPTION } from '@/modules/platform-administration/users/account-rules';
import { institutionUsersHref } from '@/modules/platform-administration/users/institution-user-query';
import { listInstitutionUsers } from '@/modules/platform-administration/users/institution-user-service';

export const metadata: Metadata = { title: 'Users' };

// 10's three fields, verbatim: the platform lists the same `UserInTenantSummary`.
const FIELDS: ToolbarField[] = [
  { kind: 'search', name: 'q', label: 'Search', placeholder: 'Name, username or email' },
  {
    kind: 'select',
    name: 'userStatus',
    label: 'User status',
    allLabel: 'All user statuses',
    options: USER_STATUSES.map((value) => ({ value, label: userStatusLabel(value) })),
  },
  {
    kind: 'select',
    name: 'membershipStatus',
    label: 'Membership',
    allLabel: 'All memberships',
    options: MEMBERSHIP_STATUSES.map((value) => ({ value, label: humanizeEnum(value) })),
  },
];

interface UsersTabProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** An institution's users (spec §11.2): the hero is the layout's, so the list sits in one card.
 * Account actions live on each user's record, never here. */
export default async function UsersTab({ params, searchParams }: UsersTabProps) {
  const tenantId = parseInstitutionId((await params).tenantId);
  if (!tenantId) notFound(); // rule 7: before any read
  const path = institutionUsersHref(tenantId);

  const urlParams = toSearchParams(await searchParams);
  const query = parseUserListQuery(urlParams);
  const [tenant, users] = await Promise.all([
    // The layout's cached read: if it failed, the layout renders that failure, not this tab.
    load(getTenant(tenantId)),
    load(listInstitutionUsers(tenantId, query)),
  ]);
  // The layout renders the institution's failure and drops this tab; this shows only when the two
  // reads (the layout's, keyed by the URL as typed, and this one, lower-cased) disagree. A visible
  // failure, never a blank body.
  if (!tenant.ok) {
    return (
      <SectionCard title="Users" description={INSTITUTION_USERS_DESCRIPTION}>
        <ErrorState problem={tenant.problem} />
      </SectionCard>
    );
  }

  if (!users.ok) {
    return (
      <SectionCard title="Users" description={INSTITUTION_USERS_DESCRIPTION}>
        {users.problem.code === 'forbidden' ? (
          <ForbiddenState />
        ) : (
          <ErrorState problem={users.problem} />
        )}
      </SectionCard>
    );
  }

  const redirectPage = lastPageIfPastEnd(users.value.page);
  if (redirectPage !== null) {
    redirect(hrefWith(path, urlParams, { page: redirectPage === 0 ? null : String(redirectPage) }));
  }

  const total = users.value.page.totalItems;

  return (
    <SectionCard title="Users" description={INSTITUTION_USERS_DESCRIPTION}>
      <ListNavigationProvider>
        <Box sx={{ position: 'relative' }}>
          <ListToolbar
            // The platform workspace shows UTC; no datetime field here, so the zone is unused.
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
                    : 'This institution has no users yet.'
                }
              />
            ) : (
              <UserDirectoryTable users={users.value.items} basePath={path} />
            )}
            <TablePaginationBar page={users.value.page} />
          </ListBusyRegion>
        </Box>
      </ListNavigationProvider>
    </SectionCard>
  );
}
