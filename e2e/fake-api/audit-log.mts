import { randomUUID } from 'node:crypto';
import type { AccessContext } from './access.mts';
import type { RunState } from './state.mts';

/**
 * Appends a `FakeAuditEvent` for a successful mutation (contract §E.4 stamps the actor's selected
 * branch, or null at institution level). Callers invoke this inside `produce`, after the state
 * change, so a lock timeout, a conflict, or an idempotent replay never records one; a refusal the
 * platform records through `recordIndependently` passes `outcome: 'DENIED'` before it throws. The
 * row lands in the actor's organisation's log unless `organisationId` names another: a platform
 * action on a tenant is written to that tenant's log, which the platform context can't read
 * (contract §G, BG-06).
 */
export function recordAuditEvent(
  state: RunState,
  access: AccessContext,
  event: {
    entityType: string;
    entityId: string | null;
    action: string;
    reason: string | null;
    organisationId?: string;
    /** `INFO` unless the platform raises it (a maker-checker switch is `HIGH`). */
    severity?: string;
    /** `SUCCESS` unless the platform records a refusal (`DENIED`). */
    outcome?: string;
    /** The selected branch unless the row names the branch it is about. */
    branchId?: string | null;
    beforeJson?: string;
    afterJson?: string;
    /** `metadata_json`'s keys, e.g. `selfApproved` on a relaxed maker-checker approval. */
    metadata?: Record<string, string>;
  },
): void {
  state.auditEvents.push({
    id: randomUUID(),
    organisationId: event.organisationId ?? access.organisation.id,
    occurredAt: new Date().toISOString(),
    actorUserId: access.claims.userId,
    actorType: 'USER',
    branchId: event.branchId === undefined ? access.claims.branchId : event.branchId,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    outcome: event.outcome ?? 'SUCCESS',
    severity: event.severity ?? 'INFO',
    reason: event.reason,
    beforeJson: event.beforeJson ?? null,
    afterJson: event.afterJson ?? null,
    metadataJson: JSON.stringify(event.metadata ?? {}),
  });
}
