export interface ApiPageMetadata {
  number: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiPage<T> {
  items: readonly T[];
  page: ApiPageMetadata;
}

export interface TenantSummary {
  id: string;
  tenantCode: string;
  displayName: string;
  countryCode: string;
  baseCurrencyCode?: string;
  timezone?: string;
  status: string;
  bootstrapStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantDetail extends TenantSummary {
  bootstrapFailureCode: string | null;
}

export interface TenantUserSummary {
  id: string;
  username: string;
  email: string;
  displayName: string;
  userStatus: string;
  membershipStatus: string;
}

export interface TenantUserDetail {
  id: string;
  username: string;
  email: string;
  displayName: string;
  userStatus: string;
  membershipStatus: string;
}

export interface BranchDetail {
  id: string;
  organisationId: string;
  branchCode: string;
  branchName: string;
  branchType: string;
  parentBranchId: string | null;
  status: string;
  timezone: string;
  address: Readonly<Record<string, string>>;
  openedOn: string | null;
  closedOn: string | null;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BranchSummary = BranchDetail;

export interface AuditEvent {
  id: string;
  organisationId: string;
  occurredAt: string;
  actorUserId: string | null;
  actorType: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  action: string;
  outcome: string;
  severity: string;
}

export interface AuditEventDetail extends AuditEvent {
  actorExternalSubject: string | null;
  branchId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  requestId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  metadataJson: string;
  reason: string | null;
}

export interface TenantListQuery {
  q?: string;
  status?: string;
  country?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface UserListQuery {
  q?: string;
  userStatus?: string;
  membershipStatus?: string;
  page?: number;
  size?: number;
}

export interface BranchListQuery {
  q?: string;
  status?: string;
  type?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface AuditListQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  occurredFrom?: string;
  occurredTo?: string;
  page?: number;
  size?: number;
}
