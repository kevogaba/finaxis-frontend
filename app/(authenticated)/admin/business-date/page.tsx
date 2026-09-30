import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EventOutlined from '@mui/icons-material/EventOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { toSearchParams } from '@/lib/api/query-string';
import { formatBusinessDate } from '@/lib/format';
import { availableBusinessDateActions } from '@/modules/administration/business-date/business-date-rules';
import {
  getBusinessDate,
  listBusinessDateHistory,
} from '@/modules/administration/business-date/business-date-service';
import {
  BUSINESS_DATE_FOCUS_FALLBACK_ID,
  BusinessDateActions,
} from '@/modules/administration/business-date/components/business-date-actions';
import { BusinessDateHistoryTable } from '@/modules/administration/business-date/components/business-date-history-table';

export const metadata: Metadata = { title: 'Business date' };

const HISTORY_PAGE_SIZE = 20;

interface BusinessDatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function hrefWith(params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  });
  const query = next.toString();
  return query ? `/admin/business-date?${query}` : '/admin/business-date';
}

export default async function BusinessDatePage({ searchParams }: BusinessDatePageProps) {
  const params = toSearchParams(await searchParams);
  const paging = parsePaging(params, HISTORY_PAGE_SIZE);
  // No page-level session check: every read below goes through apiGet -> backendApi ->
  // getKeycloakAccessToken, which throws BackendApiError(401) without a Better Auth session, and
  // load() sends that to /login. The (authenticated) layout validates the session too.
  const [current, history, selected, timeZone] = await Promise.all([
    load(getBusinessDate()),
    load(listBusinessDateHistory(paging)),
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);

  // A bookmarked ?page= past the end of a shrunk result set (audit's page uses the same guard).
  if (history.ok) {
    const redirectPage = lastPageIfPastEnd(history.value.page);
    if (redirectPage !== null) {
      redirect(hrefWith(params, { page: redirectPage === 0 ? null : String(redirectPage) }));
    }
  }

  const permissions = selected.kind === 'resolved' ? selected.profile.permissions : [];
  // I2: lets a Server Action refuse a stale submit if the user switched organisation elsewhere.
  const contextOrganisationId =
    selected.kind === 'resolved' ? selected.context.organization.id : undefined;
  const actorNames = history.ok
    ? await resolveUserNames(
        history.value.items.flatMap((entry) => (entry.actorUserId ? [entry.actorUserId] : [])),
      )
    : new Map<string, string>();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Business date"
        description="The institution's operating date and its close-of-business cycle."
      />
      <Stack spacing={5}>
        {current.ok ? (
          <SectionCard
            title="Current business date"
            actions={
              <BusinessDateActions
                actions={availableBusinessDateActions(current.value.status, { permissions })}
                currentDate={current.value.date}
                contextOrganisationId={contextOrganisationId}
              />
            }
          >
            <Box
              sx={{ px: 4, py: 5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}
            >
              <EventOutlined color="primary" aria-hidden="true" />
              <Typography
                id={BUSINESS_DATE_FOCUS_FALLBACK_ID}
                component="p"
                variant="h3"
                tabIndex={-1}
              >
                {formatBusinessDate(current.value.date, 'long')}
              </Typography>
              <StatusChip value={current.value.status} />
            </Box>
          </SectionCard>
        ) : (
          <Paper>
            <ErrorState problem={current.problem} />
          </Paper>
        )}
        <SectionCard
          title="History"
          description="Every advance and close-of-business step, newest first."
        >
          {!history.ok ? (
            <ErrorState problem={history.problem} />
          ) : history.value.items.length === 0 ? (
            <EmptyState
              title="No business date changes yet"
              description="Advances and close-of-business steps appear here."
            />
          ) : (
            <>
              <BusinessDateHistoryTable
                entries={history.value.items}
                actorNames={actorNames}
                timeZone={timeZone}
              />
              <TablePaginationBar page={history.value.page} />
            </>
          )}
        </SectionCard>
      </Stack>
    </>
  );
}
