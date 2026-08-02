import 'server-only';
import { backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';
import { z } from 'zod';
import type {
  ApiPage,
  AuditEvent,
  AuditEventDetail,
  AuditListQuery,
  BranchDetail,
  BranchListQuery,
  TenantDetail,
  TenantListQuery,
  TenantSummary,
  TenantUserDetail,
  TenantUserSummary,
  UserListQuery,
} from './platform-administration.types';
import { toQueryString } from './platform-administration-queries';
import {
  mapAuditDetail,
  mapAuditPage,
  mapBranch,
  mapBranchPage,
  mapTenantDetail,
  mapTenantPage,
  mapTenantUser,
  mapTenantUserPage,
} from './platform-administration-mappers';

const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

async function contextToken(headers: Headers): Promise<string> {
  const token = await readContextToken(headers);
  if (!token) throw new Error('A selected platform context is required.');
  return token;
}

async function read<T>(path: string, headers: Headers, map: (value: unknown) => T): Promise<T> {
  const raw = await backendApi.get<unknown>(path, headers, await contextToken(headers));
  return map(raw);
}

export const platformAdministrationService = {
  listTenants(headers: Headers, query: TenantListQuery): Promise<ApiPage<TenantSummary>> {
    return read<ApiPage<TenantSummary>>(
      `/api/v1/platform/tenants${toQueryString({
        q: query.q,
        status: query.status,
        country: query.country,
        created_from: query.createdFrom,
        created_to: query.createdTo,
        page: query.page ?? 0,
        size: query.size ?? 25,
        sort_by: query.sortBy,
        sort_dir: query.sortDir,
      })}`,
      headers,
      (raw) => mapTenantPage(raw as Parameters<typeof mapTenantPage>[0]),
    );
  },
  getTenant(headers: Headers, tenantId: string): Promise<TenantDetail> {
    return read(`/api/v1/platform/tenants/${idSchema.parse(tenantId)}`, headers, (raw) =>
      mapTenantDetail(raw as Parameters<typeof mapTenantDetail>[0]),
    );
  },
  listTenantUsers(
    headers: Headers,
    tenantId: string,
    query: UserListQuery,
  ): Promise<ApiPage<TenantUserSummary>> {
    return read<ApiPage<TenantUserSummary>>(
      `/api/v1/platform/tenants/${idSchema.parse(tenantId)}/users${toQueryString({
        q: query.q,
        user_status: query.userStatus,
        membership_status: query.membershipStatus,
        page: query.page ?? 0,
        size: query.size ?? 25,
      })}`,
      headers,
      (raw) => mapTenantUserPage(raw as Parameters<typeof mapTenantUserPage>[0]),
    );
  },
  getTenantUser(headers: Headers, tenantId: string, userId: string): Promise<TenantUserDetail> {
    return read(
      `/api/v1/platform/tenants/${idSchema.parse(tenantId)}/users/${idSchema.parse(userId)}`,
      headers,
      (raw) => mapTenantUser(raw as Parameters<typeof mapTenantUser>[0]),
    );
  },
  listTenantBranches(
    headers: Headers,
    tenantId: string,
    query: BranchListQuery,
  ): Promise<ApiPage<BranchDetail>> {
    return read<ApiPage<BranchDetail>>(
      `/api/v1/platform/tenants/${idSchema.parse(tenantId)}/branches${toQueryString({
        q: query.q,
        status: query.status,
        type: query.type,
        page: query.page ?? 0,
        size: query.size ?? 25,
        sort_by: query.sortBy,
        sort_dir: query.sortDir,
      })}`,
      headers,
      (raw) => mapBranchPage(raw as Parameters<typeof mapBranchPage>[0]),
    );
  },
  getTenantBranch(headers: Headers, tenantId: string, branchId: string): Promise<BranchDetail> {
    return read(
      `/api/v1/platform/tenants/${idSchema.parse(tenantId)}/branches/${idSchema.parse(branchId)}`,
      headers,
      (raw) => mapBranch(raw as Parameters<typeof mapBranch>[0]),
    );
  },
  listAuditEvents(headers: Headers, query: AuditListQuery): Promise<ApiPage<AuditEvent>> {
    return read<ApiPage<AuditEvent>>(
      `/api/v1/tenant/audit-events${toQueryString({
        entity_type: query.entityType,
        entity_id: query.entityId,
        actor_id: query.actorId,
        action: query.action,
        occurred_from: query.occurredFrom,
        occurred_to: query.occurredTo,
        page: query.page ?? 0,
        size: query.size ?? 25,
      })}`,
      headers,
      (raw) => mapAuditPage(raw as Parameters<typeof mapAuditPage>[0]),
    );
  },
  getAuditEvent(headers: Headers, eventId: string): Promise<AuditEventDetail> {
    return read(`/api/v1/tenant/audit-events/${idSchema.parse(eventId)}`, headers, (raw) =>
      mapAuditDetail(raw as Parameters<typeof mapAuditDetail>[0]),
    );
  },
};
