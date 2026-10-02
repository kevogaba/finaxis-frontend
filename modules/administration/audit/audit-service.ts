import 'server-only';
import { apiGet } from '@/lib/api/tenant-api';
import { uuidSchema, type Page } from '@/lib/api/wire';
import {
  auditDetailSchema,
  auditPageSchema,
  type AuditEvent,
  type AuditEventDetail,
} from './audit-contract';
import { auditApiPath, type AuditQuery } from './audit-query';

export function listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>> {
  return apiGet(auditApiPath(query), auditPageSchema);
}

export async function getAuditEvent(eventId: string): Promise<AuditEventDetail> {
  return apiGet(`/api/v1/tenant/audit-events/${uuidSchema.parse(eventId)}`, auditDetailSchema);
}
