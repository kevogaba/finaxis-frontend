import { randomUUID } from 'node:crypto';
import type { AccessContext } from './access.mts';
import type { RunState } from './state.mts';

/**
 * Appends a `FakeAuditEvent` for a successful mutation (contract §E.4 stamps the actor's selected
 * branch, or null at institution level). Callers invoke this inside `produce`, after the state
 * change, so a lock timeout, a conflict, or an idempotent replay never records one.
 */
export function recordAuditEvent(
  state: RunState,
  access: AccessContext,
  event: { entityType: string; entityId: string | null; action: string; reason: string | null },
): void {
  state.auditEvents.push({
    id: randomUUID(),
    organisationId: access.organisation.id,
    occurredAt: new Date().toISOString(),
    actorUserId: access.claims.userId,
    actorType: 'USER',
    branchId: access.claims.branchId,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: event.reason,
    beforeJson: null,
    afterJson: null,
    metadataJson: '{}',
  });
}
