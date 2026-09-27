import { describe, expect, it } from 'vitest';
import { auditDetailSchema, auditPageSchema } from './audit-contract';

const page = {
  number: 0,
  size: 20,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

const summary = {
  id: 'e1',
  occurred_at: '2026-09-07T07:28:00Z',
  actor_type: 'USER',
  actor_id: 'u1',
  branch_id: null,
  action: 'user.invite',
  resource_type: 'USER',
  resource_id: 'u2',
  outcome: 'SUCCESS',
  severity: 'INFO',
  reason: null,
};

describe('audit contract', () => {
  it('maps the summary names (resource_*, actor_id) to the domain shape', () => {
    expect(auditPageSchema.parse({ items: [summary], page }).items[0]).toEqual({
      id: 'e1',
      occurredAt: '2026-09-07T07:28:00Z',
      actorType: 'USER',
      actorUserId: 'u1',
      branchId: null,
      action: 'user.invite',
      entityType: 'USER',
      entityId: 'u2',
      outcome: 'SUCCESS',
      severity: 'INFO',
      reason: null,
    });
  });

  it('maps the detail names (entity_*, actor_user_id) to the same domain fields', () => {
    const detail = auditDetailSchema.parse({
      id: 'e1',
      organisation_id: 'o1',
      occurred_at: '2026-09-07T07:28:00Z',
      actor_user_id: 'u1',
      actor_external_subject: 'kc-1',
      actor_type: 'USER',
      branch_id: null,
      event_type: 'USER',
      entity_type: 'USER',
      entity_id: 'u2',
      action: 'user.invite',
      outcome: 'SUCCESS',
      severity: 'INFO',
      ip_address: null,
      user_agent: 'Mozilla',
      correlation_id: 'c1',
      request_id: 'r1',
      before_json: null,
      after_json: '{"status":"DRAFT"}',
      metadata_json: '{}',
      reason: 'New teller',
    });
    expect(detail).toMatchObject({
      actorUserId: 'u1',
      entityType: 'USER',
      entityId: 'u2',
      afterJson: '{"status":"DRAFT"}',
    });
  });

  it('rejects a summary with a missing field (schema drift)', () => {
    const { action: _omit, ...broken } = summary;
    expect(auditPageSchema.safeParse({ items: [broken], page }).success).toBe(false);
  });
});
