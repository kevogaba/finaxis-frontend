import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import type { ProblemView } from '@/lib/api/problem';
import { getBranchIndex, getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import { toSearchParams } from '@/lib/api/query-string';
import { actionLabel, entityTypeLabel } from '@/modules/administration/audit/audit-vocabulary';
import { parseAuditQuery } from '@/modules/administration/audit/audit-query';
import { getAuditEvent, listAuditEvents } from '@/modules/administration/audit/audit-service';
import {
  AuditEventDrawer,
  type AuditDrawerDetail,
} from '@/modules/administration/audit/components/audit-event-drawer';
import {
  AuditEventTable,
  type AuditRow,
} from '@/modules/administration/audit/components/audit-event-table';
import { AuditFilters } from '@/modules/administration/audit/components/audit-filters';
import { UUID_PATTERN } from '@/lib/api/wire';

export const metadata: Metadata = { title: 'Audit trail' };

interface AuditPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function hrefWith(params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  });
  const query = next.toString();
  return query ? `/admin/audit?${query}` : '/admin/audit';
}

function prettyJson(value: string | null): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function AuditTrailPage({ searchParams }: AuditPageProps) {
  const params = toSearchParams(await searchParams);
  const query = parseAuditQuery(params);
  const eventId = params.get('event');

  // No page-level session check: every read below goes through apiGet -> backendApi ->
  // getKeycloakAccessToken, which throws BackendApiError(401) without a Better Auth session, and
  // load() sends that to /login. The (authenticated) layout validates the session too.
  const [events, timeZone, branches] = await Promise.all([
    load(listAuditEvents(query)),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);

  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Audit trail"
      description="Search traceable administrative events by entity, action, actor, or date."
    />
  );

  if (!events.ok) {
    return (
      <>
        {header}
        <Paper>
          <ErrorState problem={events.problem} />
        </Paper>
      </>
    );
  }

  const userIds = [
    ...events.value.items.flatMap((event) => (event.actorUserId ? [event.actorUserId] : [])),
    ...events.value.items.flatMap((event) =>
      event.entityType === 'USER' && event.entityId ? [event.entityId] : [],
    ),
    ...(query.actorId ? [query.actorId] : []),
  ];
  const names = await resolveUserNames(userIds);

  const rows: AuditRow[] = events.value.items.map((event) => {
    const when = formatInstant(event.occurredAt, timeZone);
    const actorName = event.actorUserId
      ? (names.get(event.actorUserId) ?? shortId(event.actorUserId))
      : 'System';
    const entityName =
      event.entityId === null
        ? '—'
        : event.entityType === 'USER'
          ? (names.get(event.entityId) ?? shortId(event.entityId))
          : event.entityType === 'BRANCH'
            ? (branches.get(event.entityId)?.name ?? shortId(event.entityId))
            : shortId(event.entityId);
    return {
      id: event.id,
      date: when.date,
      time: when.time,
      actorLabel: actorName,
      actorFilterHref: event.actorUserId
        ? hrefWith(params, { actorId: event.actorUserId, page: null, event: null })
        : null,
      actionLabel: actionLabel(event.action),
      action: event.action,
      reason: event.reason,
      entityLabel: `${entityTypeLabel(event.entityType)} · ${entityName}`,
      branchLabel: event.branchId
        ? (branches.get(event.branchId)?.name ?? shortId(event.branchId))
        : '—',
      outcome: event.outcome,
      severity: event.severity,
      detailHref: hrefWith(params, { event: event.id }),
    };
  });

  // A failed detail load renders inline between the toolbar and the table; the list stays
  // usable, and the failure is never swallowed silently (never notFound(), which would replace
  // the whole list because of one bad query param).
  // ponytail: known ceiling — the `event` param stays in the URL until the user opens another
  // event, filters by an actor, or clears filters.
  let drawer: AuditDrawerDetail | null = null;
  let detailProblem: ProblemView | null = null;
  if (eventId && UUID_PATTERN.test(eventId)) {
    const detail = await load(getAuditEvent(eventId));
    if (detail.ok) {
      const d = detail.value;
      const when = formatInstant(d.occurredAt, timeZone);
      const actor = d.actorUserId
        ? ((await resolveUserNames([d.actorUserId])).get(d.actorUserId) ?? shortId(d.actorUserId))
        : 'System';
      drawer = {
        title: actionLabel(d.action),
        occurred: `${when.date} · ${when.time} (${timeZone})`,
        facts: [
          { label: 'Action', value: d.action },
          {
            label: 'Actor',
            value: d.actorExternalSubject ? `${actor} (${d.actorExternalSubject})` : actor,
          },
          { label: 'Entity', value: `${entityTypeLabel(d.entityType)} · ${d.entityId ?? '—'}` },
          {
            label: 'Branch',
            value: d.branchId ? (branches.get(d.branchId)?.name ?? d.branchId) : '—',
          },
          { label: 'Outcome', value: d.outcome },
          { label: 'Severity', value: d.severity },
          { label: 'Reason', value: d.reason ?? '—' },
          { label: 'Request ID', value: d.requestId ?? '—' },
          { label: 'Correlation ID', value: d.correlationId ?? '—' },
          { label: 'User agent', value: d.userAgent ?? '—' },
        ],
        before: prettyJson(d.beforeJson),
        after: prettyJson(d.afterJson),
        metadata: prettyJson(d.metadataJson === '{}' ? null : d.metadataJson),
      };
    } else {
      detailProblem = detail.problem;
    }
  }

  const total = events.value.page.totalItems;
  const actorChip = query.actorId
    ? {
        label: `Actor: ${names.get(query.actorId) ?? shortId(query.actorId)}`,
        removeParam: 'actorId',
      }
    : null;

  return (
    <>
      {header}
      <Paper sx={{ overflow: 'hidden' }}>
        <AuditFilters
          entityType={query.entityType}
          action={query.action}
          resultLabel={`${total} ${total === 1 ? 'event' : 'events'}`}
          actorChip={actorChip}
        />
        {detailProblem && <ErrorState problem={detailProblem} />}
        {rows.length === 0 ? (
          <EmptyState title="No audit events" description="No events match these filters." />
        ) : (
          <AuditEventTable rows={rows} timeZone={timeZone} />
        )}
        <TablePaginationBar page={events.value.page} />
      </Paper>
      {drawer && <AuditEventDrawer detail={drawer} closeHref={hrefWith(params, { event: null })} />}
    </>
  );
}
