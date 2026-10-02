import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import { pageOf, parseInstantParam, problem, sendJson } from '../http.mts';
import { route } from '../router.mts';
import type { Route } from '../router.mts';

export const auditRoutes: Route[] = [
  route('GET', '/api/v1/tenant/audit-events', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'audit.view');
    const { query } = context;
    const from = parseInstantParam(query, 'occurred_from');
    const to = parseInstantParam(query, 'occurred_to');
    const matches = context.state.auditEvents
      .filter(
        (event) =>
          event.organisationId === access.organisation.id &&
          (!query.get('entity_type') || event.entityType === query.get('entity_type')) &&
          (!query.get('entity_id') || event.entityId === query.get('entity_id')) &&
          (!query.get('actor_id') || event.actorUserId === query.get('actor_id')) &&
          (!query.get('action') || event.action === query.get('action')) &&
          (from === undefined || Date.parse(event.occurredAt) >= from) &&
          (to === undefined || Date.parse(event.occurredAt) <= to),
      )
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .map((event) => ({
        id: event.id,
        occurred_at: event.occurredAt,
        actor_type: event.actorType,
        actor_id: event.actorUserId,
        branch_id: event.branchId,
        action: event.action,
        resource_type: event.entityType,
        resource_id: event.entityId,
        outcome: event.outcome,
        severity: event.severity,
        reason: event.reason,
      }));
    sendJson(context.res, 200, pageOf(matches, query));
  }),

  route('GET', '/api/v1/tenant/audit-events/:event_id', (context) => {
    const access = requireContext(context);
    requireTenantContext(access);
    requirePermission(access, 'audit.view');
    const event = context.state.auditEvents.find(
      (candidate) =>
        candidate.id === context.params.event_id &&
        candidate.organisationId === access.organisation.id,
    );
    if (!event) {
      throw problem(404, 'audit_event_not_found', 'Audit event not found.');
    }
    sendJson(context.res, 200, {
      id: event.id,
      organisation_id: event.organisationId,
      occurred_at: event.occurredAt,
      actor_user_id: event.actorUserId,
      actor_external_subject: event.actorUserId ? 'e2e-keycloak-subject' : null,
      actor_type: event.actorType,
      branch_id: event.branchId,
      event_type: event.entityType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action,
      outcome: event.outcome,
      severity: event.severity,
      ip_address: null,
      user_agent: 'Mozilla/5.0 (fake)',
      correlation_id: `corr-${event.id.slice(-4)}`,
      request_id: `req-${event.id.slice(-4)}`,
      before_json: event.beforeJson,
      after_json: event.afterJson,
      metadata_json: event.metadataJson,
      reason: event.reason,
    });
  }),
];
