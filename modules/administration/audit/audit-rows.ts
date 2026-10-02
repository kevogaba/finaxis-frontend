import { toQueryString } from '@/lib/api/query-string';
import { formatInstant, shortId } from '@/lib/format';
import type { AuditEvent } from './audit-contract';
import { actionLabel, entityTypeLabel } from './audit-vocabulary';
import type { AuditRow } from './components/audit-event-table';

export interface AuditLookups {
  names: ReadonlyMap<string, string>;
  branches: ReadonlyMap<string, { name: string; code: string }>;
  timeZone: string;
}

export interface AuditRowLinks {
  detail: (eventId: string) => string;
  actor: (actorUserId: string) => string;
}

/** The user IDs a page of events shows by name: actors and USER entities (≤ 2 × page size). */
export function auditUserIds(events: readonly AuditEvent[]): string[] {
  return events.flatMap((event) => [
    ...(event.actorUserId ? [event.actorUserId] : []),
    ...(event.entityType === 'USER' && event.entityId ? [event.entityId] : []),
  ]);
}

/** Users and branches by resolved name; any other type (or an unresolved ID) by short ID. */
export function auditEntityName(
  entityType: string,
  entityId: string,
  lookups: Pick<AuditLookups, 'names' | 'branches'>,
): string {
  if (entityType === 'USER') return lookups.names.get(entityId) ?? shortId(entityId);
  if (entityType === 'BRANCH') return lookups.branches.get(entityId)?.name ?? shortId(entityId);
  return shortId(entityId);
}

/** The audit table's row view-model, shared by `/admin/audit` and record Audit tabs. */
export function toAuditRows(
  events: readonly AuditEvent[],
  lookups: AuditLookups,
  links: AuditRowLinks,
): AuditRow[] {
  return events.map((event) => {
    const when = formatInstant(event.occurredAt, lookups.timeZone);
    return {
      id: event.id,
      date: when.date,
      time: when.time,
      actorLabel: event.actorUserId
        ? (lookups.names.get(event.actorUserId) ?? shortId(event.actorUserId))
        : 'System',
      actorFilterHref: event.actorUserId ? links.actor(event.actorUserId) : null,
      actionLabel: actionLabel(event.action),
      action: event.action,
      reason: event.reason,
      entityLabel: `${entityTypeLabel(event.entityType)} · ${
        event.entityId === null ? '—' : auditEntityName(event.entityType, event.entityId, lookups)
      }`,
      branchLabel: event.branchId
        ? (lookups.branches.get(event.branchId)?.name ?? shortId(event.branchId))
        : '—',
      outcome: event.outcome,
      severity: event.severity,
      detailHref: links.detail(event.id),
    };
  });
}

// A mapped-type alias (not an object-literal `type`, and not an `interface`) so it keeps an
// implicit index signature: TS never infers one for an `interface`, and `toQueryString` below
// needs it.
export type AuditTrailFilter = Partial<
  Record<'entityType' | 'entityId' | 'actorId' | 'event', string>
>;

/** `/admin/audit` narrowed to one view, optionally with an event's drawer open. */
export function auditTrailHref(filter: AuditTrailFilter): string {
  return `/admin/audit${toQueryString(filter)}`;
}
