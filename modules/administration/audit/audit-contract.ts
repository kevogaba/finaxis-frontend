import { z } from 'zod';
import { instantSchema, pageSchema } from '@/lib/api/wire';

const nullableString = z.string().nullable();

const auditSummarySchema = z
  .object({
    id: z.string(),
    occurred_at: instantSchema,
    actor_type: z.string(),
    actor_id: nullableString,
    branch_id: nullableString,
    action: z.string(),
    resource_type: z.string(),
    resource_id: nullableString,
    outcome: z.string(),
    severity: z.string(),
    reason: nullableString,
  })
  .transform((event) => ({
    id: event.id,
    occurredAt: event.occurred_at,
    actorType: event.actor_type,
    actorUserId: event.actor_id,
    branchId: event.branch_id,
    action: event.action,
    entityType: event.resource_type,
    entityId: event.resource_id,
    outcome: event.outcome,
    severity: event.severity,
    reason: event.reason,
  }));

export type AuditEvent = z.output<typeof auditSummarySchema>;

export const auditPageSchema = pageSchema(auditSummarySchema);

export const auditDetailSchema = z
  .object({
    id: z.string(),
    organisation_id: z.string(),
    occurred_at: instantSchema,
    actor_user_id: nullableString,
    actor_external_subject: nullableString,
    actor_type: z.string(),
    branch_id: nullableString,
    event_type: z.string(),
    entity_type: z.string(),
    entity_id: nullableString,
    action: z.string(),
    outcome: z.string(),
    severity: z.string(),
    ip_address: nullableString,
    user_agent: nullableString,
    correlation_id: nullableString,
    request_id: nullableString,
    before_json: nullableString,
    after_json: nullableString,
    metadata_json: z.string(),
    reason: nullableString,
  })
  .transform((event) => ({
    id: event.id,
    occurredAt: event.occurred_at,
    actorType: event.actor_type,
    actorUserId: event.actor_user_id,
    actorExternalSubject: event.actor_external_subject,
    branchId: event.branch_id,
    action: event.action,
    entityType: event.entity_type,
    entityId: event.entity_id,
    outcome: event.outcome,
    severity: event.severity,
    reason: event.reason,
    userAgent: event.user_agent,
    correlationId: event.correlation_id,
    requestId: event.request_id,
    beforeJson: event.before_json,
    afterJson: event.after_json,
    metadataJson: event.metadata_json,
  }));

export type AuditEventDetail = z.output<typeof auditDetailSchema>;
