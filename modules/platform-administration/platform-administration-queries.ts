import { z } from 'zod';
import type {
  AuditListQuery,
  BranchListQuery,
  TenantListQuery,
  UserListQuery,
} from './platform-administration.types';

const pageSchema = z.number().int().min(0).default(0);
const sizeSchema = z.number().int().min(1).max(100).default(25);
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export function parsePage(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return pageSchema.parse(Number.isInteger(parsed) ? parsed : 0);
}

export function parseSize(value: string | null | undefined): number {
  const parsed = Number(value ?? 25);
  return sizeSchema.parse(Number.isInteger(parsed) ? parsed : 25);
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

function optionalUuid(value: string | null | undefined): string | undefined {
  const candidate = optionalText(value);
  return candidate ? uuidSchema.parse(candidate) : undefined;
}

function queryFromParams(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of params) {
    if (value !== '') result.set(key, value);
  }
  return result;
}

export function parseTenantListQuery(params: URLSearchParams): TenantListQuery {
  return {
    q: optionalText(params.get('q')),
    status: optionalText(params.get('status')),
    country: optionalText(params.get('country')),
    createdFrom: optionalText(params.get('createdFrom')),
    createdTo: optionalText(params.get('createdTo')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
    sortBy: optionalText(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'desc' ? 'desc' : 'asc',
  };
}

export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  return {
    q: optionalText(params.get('q')),
    userStatus: optionalText(params.get('userStatus')),
    membershipStatus: optionalText(params.get('membershipStatus')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
  };
}

export function parseBranchListQuery(params: URLSearchParams): BranchListQuery {
  return {
    q: optionalText(params.get('q')),
    status: optionalText(params.get('status')),
    type: optionalText(params.get('type')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
    sortBy: optionalText(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'desc' ? 'desc' : 'asc',
  };
}

export function parseAuditListQuery(params: URLSearchParams): AuditListQuery {
  return {
    entityType: optionalText(params.get('entityType')),
    entityId: optionalUuid(params.get('entityId')),
    actorId: optionalUuid(params.get('actorId')),
    action: optionalText(params.get('action')),
    occurredFrom: optionalText(params.get('occurredFrom')),
    occurredTo: optionalText(params.get('occurredTo')),
    page: parsePage(params.get('page')),
    size: parseSize(params.get('size')),
  };
}

export function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = queryFromParams(
    new URLSearchParams(
      Object.entries(query)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const value = params.toString();
  return value ? `?${value}` : '';
}
