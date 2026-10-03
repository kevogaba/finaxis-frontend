import type {
  ApiPage,
  ApiPageMetadata,
  BranchDetail,
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
