import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { serverEnv } from '@/config/env.server';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { toQueryString, toSearchParams } from '@/lib/api/query-string';
import { NameCell } from '@/modules/profile/components/name-cell';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { SwitchContextButton } from '@/modules/profile/components/switch-context-button';
import { listMyOrganisations, requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Contexts · Profile' };

/** Directories default to 10 rows (spec §6.2). */
const DEFAULT_PAGE_SIZE = 10;

interface ProfileContextsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfileContextsPage({ searchParams }: ProfileContextsPageProps) {
  const params = toSearchParams(await searchParams);
  const { user, context } = await requireProfile();
  const organisations = await load(listMyOrganisations(parsePaging(params, DEFAULT_PAGE_SIZE)));

  // Outside load(), like the audit page: a bookmarked page past the end goes to the last one.
  if (organisations.ok) {
    const lastPage = lastPageIfPastEnd(organisations.value.page);
    if (lastPage !== null) {
      redirect(
        `/profile/contexts${toQueryString({
          size: params.get('size') ?? undefined,
          page: lastPage === 0 ? undefined : lastPage,
        })}`,
      );
    }
  }

  const branchLabel = context.branch?.name ?? 'All branches (institution level)';
  const branchesTitle = 'Branches';

  return (
    <Stack spacing={4}>
      <ProfileSection
        title="Organisations"
        description="Where you hold an active membership. Switching re-checks your access and never grants more."
        actions={
          <SwitchContextButton platformOrganisationId={serverEnv.PLATFORM_ORGANISATION_ID} />
        }
      >
        {organisations.ok ? (
          <ListNavigationProvider>
            <Box sx={{ position: 'relative' }}>
              <ListNavigationProgress />
              <ListBusyRegion>
                {organisations.value.items.length === 0 ? (
                  // BG-23: the backend filters after paging, so an in-range page can be empty.
                  <EmptyState
                    title="No organisations on this page"
                    description="Go back a page to see your organisations."
                  />
                ) : (
                  <TableContainer>
                    <Table aria-label="Organisations">
                      <TableHead>
                        <TableRow>
                          <TableCell>Organisation</TableCell>
                          <TableCell>Membership</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {organisations.value.items.map((organisation) => (
                          <TableRow key={organisation.id}>
                            <NameCell
                              name={organisation.name}
                              code={organisation.code}
                              current={organisation.id === context.organization.id}
                            />
                            <TableCell>
                              <StatusChip value={organisation.membershipStatus} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                <TablePaginationBar page={organisations.value.page} />
              </ListBusyRegion>
            </Box>
          </ListNavigationProvider>
        ) : (
          <ErrorState problem={organisations.problem} />
        )}
      </ProfileSection>

      <ProfileSection
        title={branchesTitle}
        description={`You're working at ${branchLabel} in ${user.organization.name}. Use Switch context above to change branch; only active branches can be chosen.`}
      >
        {user.branches.length === 0 ? (
          <EmptyState
            title="No branches assigned"
            description="You work at institution level (All branches)."
          />
        ) : (
          // Bounded by your own assignments (from /auth/me, de-duplicated), so no paging.
          <TableContainer>
            <Table aria-label={branchesTitle}>
              <TableHead>
                <TableRow>
                  <TableCell>Branch</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {user.branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <NameCell
                      name={branch.name}
                      code={branch.code}
                      current={branch.id === context.branch?.id}
                    />
                    <TableCell>
                      <StatusChip value={branch.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ProfileSection>
    </Stack>
  );
}
