import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { ListNavigationProvider } from '@/components/data-display/list-navigation-context';
import {
  ListBusyRegion,
  ListNavigationProgress,
} from '@/components/data-display/list-pending-indicator';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { DEFAULT_AUDIT_PAGE_SIZE, auditApiPath, type AuditQuery } from '../audit-query';
import { auditTrailHref, auditUserIds, toAuditRows } from '../audit-rows';
import type { AuditEntityType } from '../audit-vocabulary';
import { listAuditEvents } from '../audit-service';
import { AuditEventTable } from './audit-event-table';
import { AuditViewToggle } from './audit-view-toggle';

export type RecordAuditFilter =
  { entityType: AuditEntityType; entityId: string } | { actorId: string };

export interface RecordAuditView {
  /** The URL's `view` value, e.g. `membership`. */
  value: string;
  label: string;
  filter: RecordAuditFilter;
}

interface RecordAuditTabProps {
  /** The first view is the default. */
  views: readonly [RecordAuditView, ...RecordAuditView[]];
  /** The tab's awaited `searchParams` (`toSearchParams`): `view`, `page`, `size`. */
  params: URLSearchParams;
  /** The tab's own pathname, for the past-the-end page redirect. */
  path: string;
  title?: string;
  description?: string;
}

// One record Audit tab per page, so a fixed id is unique (an async component can't `useId`).
const HEADING_ID = 'record-audit-heading';

/**
 * A record's Audit tab (spec §10.1): the audit table narrowed to one view of the subject, with a
 * view toggle when there are several. "View event" and actor links open the full audit trail
 * (narrowed the same way) where the event drawer lives.
 */
export async function RecordAuditTab({
  views,
  params,
  path,
  title = 'Audit trail',
  description = 'Traceable changes and access activity for this record.',
}: RecordAuditTabProps) {
  const view = views.find((candidate) => candidate.value === params.get('view')) ?? views[0];
  const query: AuditQuery = { ...parsePaging(params, DEFAULT_AUDIT_PAGE_SIZE), ...view.filter };

  const [events, timeZone, branches] = await Promise.all([
    load(listAuditEvents(query)),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);

  if (events.ok) {
    const redirectPage = lastPageIfPastEnd(events.value.page);
    if (redirectPage !== null) {
      redirect(
        `${path}${toQueryString({
          view: params.get('view') ?? undefined,
          size: params.get('size') ?? undefined,
          page: redirectPage === 0 ? undefined : redirectPage,
        })}`,
      );
    }
  }

  const header = (
    <Box
      sx={{
        px: 4,
        py: 3.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={HEADING_ID} component="h2" variant="h5">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {description}
        </Typography>
      </Box>
      {views.length > 1 && (
        <AuditViewToggle
          views={views.map(({ value, label }) => ({ value, label }))}
          value={view.value}
        />
      )}
    </Box>
  );

  // ponytail: inline section header — SectionCard (PR 07) isn't at this layer's base; swapping to
  // it after 07 integrates is an internal change.
  if (!events.ok) {
    return (
      // The header may render AuditViewToggle (several views), which calls useListNavigation()
      // and expects the shared provider, same as the success branch below.
      <ListNavigationProvider>
        <Paper
          component="section"
          aria-labelledby={HEADING_ID}
          sx={{ overflow: 'hidden', position: 'relative' }}
        >
          {header}
          <ListNavigationProgress />
          {events.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={events.problem} />
          )}
        </Paper>
      </ListNavigationProvider>
    );
  }

  const names = await resolveUserNames(auditUserIds(events.value.items));
  const filter =
    'actorId' in view.filter
      ? { actorId: view.filter.actorId }
      : { entityType: view.filter.entityType, entityId: view.filter.entityId };
  const rows = toAuditRows(
    events.value.items,
    { names, branches, timeZone },
    {
      detail: (eventId) => auditTrailHref({ ...filter, event: eventId }),
      actor: (actorId) => auditTrailHref({ actorId }),
    },
  );

  return (
    <ListNavigationProvider>
      <Paper
        component="section"
        aria-labelledby={HEADING_ID}
        sx={{ overflow: 'hidden', position: 'relative' }}
      >
        {header}
        <ListNavigationProgress />
        <ListBusyRegion>
          {rows.length === 0 ? (
            <EmptyState
              title="No audit events"
              description="Nothing has been recorded for this view yet."
            />
          ) : (
            <AuditEventTable
              key={auditApiPath(query)}
              rows={rows}
              timeZone={timeZone}
              // Its links open another page (/admin/audit), which starts at the top.
              scrollOnNavigate
            />
          )}
          <TablePaginationBar page={events.value.page} />
        </ListBusyRegion>
      </Paper>
    </ListNavigationProvider>
  );
}
