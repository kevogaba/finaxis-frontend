import { parsePaging } from '@/lib/api/paging';
import { toQueryString } from '@/lib/api/query-string';
import { UUID_PATTERN, instantSchema } from '@/lib/api/wire';
import { AUDIT_ENTITY_TYPES } from './audit-vocabulary';

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  occurredFrom?: string;
  occurredTo?: string;
  page: number;
  size: number;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 20;

function uuidParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && UUID_PATTERN.test(value) ? value : undefined;
}

function instantParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && instantSchema.safeParse(value).success ? value : undefined;
}

/** URL → validated audit query; anything malformed is dropped rather than sent upstream. */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const entityType = params.get('entityType');
  const action = params.get('action')?.trim();

  const query: AuditQuery = parsePaging(params, DEFAULT_AUDIT_PAGE_SIZE);
  if (entityType && AUDIT_ENTITY_TYPES.some((type) => type.value === entityType)) {
    query.entityType = entityType;
  }
  if (action && /^[a-z_]+\.[a-z_]+$/.test(action)) query.action = action;
  const entityId = uuidParam(params, 'entityId');
  if (entityId) query.entityId = entityId;
  const actorId = uuidParam(params, 'actorId');
  if (actorId) query.actorId = actorId;
  const occurredFrom = instantParam(params, 'occurredFrom');
  if (occurredFrom) query.occurredFrom = occurredFrom;
  const occurredTo = instantParam(params, 'occurredTo');
  if (occurredTo) query.occurredTo = occurredTo;
  return query;
}

export function auditApiPath(query: AuditQuery): string {
  return `/api/v1/tenant/audit-events${toQueryString({
    entity_type: query.entityType,
    entity_id: query.entityId,
    actor_id: query.actorId,
    action: query.action,
    occurred_from: query.occurredFrom,
    occurred_to: query.occurredTo,
    page: query.page,
    size: query.size,
  })}`;
}
