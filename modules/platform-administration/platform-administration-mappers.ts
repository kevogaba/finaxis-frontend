import type {
  ApiPage,
  ApiPageMetadata,
  AuditEvent,
  AuditEventDetail,
  BranchDetail,
  TenantDetail,
  TenantSummary,
  TenantUserSummary,
} from './platform-administration.types';

interface RawPageMetadata {
  number: number;
  size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

interface RawPage<T> {
  items: readonly T[];
  page: RawPageMetadata;
}

interface RawTenant {
  id: string;
  tenant_code: string;
  display_name: string;
  country_code: string;
  base_currency_code?: string;
  timezone?: string;
  status: string;
  bootstrap_status?: string | null;
  bootstrap_failure_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface RawTenantUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  user_status: string;
  membership_status: string;
}

interface RawBranch {
  id: string;
  organisation_id: string;
  branch_code: string;
  branch_name: string;
  branch_type: string;
  parent_branch_id: string | null;
  status: string;
  timezone: string;
  address: Readonly<Record<string, string>>;
  opened_on: string | null;
  closed_on: string | null;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface RawAuditEvent {
  id: string;
  organisation_id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_type: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  outcome: string;
  severity: string;
}

interface RawAuditEventDetail extends RawAuditEvent {
  actor_external_subject: string | null;
  branch_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  request_id: string | null;
  before_json: string | null;
  after_json: string | null;
  metadata_json: string;
  reason: string | null;
}

export function mapPageMetadata(raw: RawPageMetadata): ApiPageMetadata {
  return {
    number: raw.number,
    size: raw.size,
    totalItems: raw.total_items,
    totalPages: raw.total_pages,
    hasNext: raw.has_next,
    hasPrevious: raw.has_previous,
  };
}

function mapTenant(raw: RawTenant): TenantSummary {
  return {
    id: raw.id,
    tenantCode: raw.tenant_code,
    displayName: raw.display_name,
    countryCode: raw.country_code,
    baseCurrencyCode: raw.base_currency_code,
    timezone: raw.timezone,
    status: raw.status,
    bootstrapStatus: raw.bootstrap_status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapTenantPage(raw: RawPage<RawTenant>): ApiPage<TenantSummary> {
  return { items: raw.items.map(mapTenant), page: mapPageMetadata(raw.page) };
}

export function mapTenantDetail(raw: RawTenant): TenantDetail {
  return { ...mapTenant(raw), bootstrapFailureCode: raw.bootstrap_failure_code ?? null };
}

export function mapTenantUser(raw: RawTenantUser): TenantUserSummary {
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    displayName: raw.display_name,
    userStatus: raw.user_status,
    membershipStatus: raw.membership_status,
  };
}

export function mapTenantUserPage(raw: RawPage<RawTenantUser>): ApiPage<TenantUserSummary> {
  return { items: raw.items.map(mapTenantUser), page: mapPageMetadata(raw.page) };
}

export function mapBranch(raw: RawBranch): BranchDetail {
  return {
    id: raw.id,
    organisationId: raw.organisation_id,
    branchCode: raw.branch_code,
    branchName: raw.branch_name,
    branchType: raw.branch_type,
    parentBranchId: raw.parent_branch_id,
    status: raw.status,
    timezone: raw.timezone,
    address: raw.address,
    openedOn: raw.opened_on,
    closedOn: raw.closed_on,
    statusReason: raw.status_reason,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapBranchPage(raw: RawPage<RawBranch>): ApiPage<BranchDetail> {
  return { items: raw.items.map(mapBranch), page: mapPageMetadata(raw.page) };
}

export function mapAuditEvent(raw: RawAuditEvent): AuditEvent {
  return {
    id: raw.id,
    organisationId: raw.organisation_id,
    occurredAt: raw.occurred_at,
    actorUserId: raw.actor_user_id,
    actorType: raw.actor_type,
    eventType: raw.event_type,
    entityType: raw.entity_type,
    entityId: raw.entity_id,
    action: raw.action,
    outcome: raw.outcome,
    severity: raw.severity,
  };
}

export function mapAuditPage(raw: RawPage<RawAuditEvent>): ApiPage<AuditEvent> {
  return { items: raw.items.map(mapAuditEvent), page: mapPageMetadata(raw.page) };
}

export function mapAuditDetail(raw: RawAuditEventDetail): AuditEventDetail {
  return {
    ...mapAuditEvent(raw),
    actorExternalSubject: raw.actor_external_subject,
    branchId: raw.branch_id,
    ipAddress: raw.ip_address,
    userAgent: raw.user_agent,
    correlationId: raw.correlation_id,
    requestId: raw.request_id,
    beforeJson: raw.before_json,
    afterJson: raw.after_json,
    metadataJson: raw.metadata_json,
    reason: raw.reason,
  };
}
