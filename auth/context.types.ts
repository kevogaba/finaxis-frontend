/**
 * Server-side representations of the Spring platform API's snake_case JSON boundary.
 * These types must not be passed to Client Components.
 */
export interface PageMetadata {
  number: number;
  size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface Page<T> {
  items: readonly T[];
  page: PageMetadata;
}

export interface BackendOrganisation {
  organisation_id: string;
  membership_id: string;
  tenant_code: string;
  display_name: string;
  organisation_status: string;
  membership_status: string;
}

export interface BackendBranch {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  branch_status: string;
}

export interface SelectOrganisationResponse {
  organisation_id: string;
  membership_id: string;
  context_token: string;
  context_header: string;
  branch_id: string | null;
  requires_branch_selection: boolean;
  assigned_branch_ids: readonly string[];
}

export interface SelectBranchResponse {
  organisation_id: string;
  membership_id: string;
  /** `null` when the request cleared the branch (All branches, BG-03). */
  branch_id: string | null;
  context_token: string;
  context_header: string;
}

export interface BackendProfileOrganisation {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface BackendProfileMembership {
  id: string;
  status: string;
}

export interface BackendProfileBranch {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface BackendProfileRole {
  id: string;
  code: string;
  name: string;
  status: string;
}

/** Where a code is held (BG-33): TENANT is every branch; BRANCH only `branch_ids`, every ACTIVE
 * branch the grant covers. A code held at both is reported once, as TENANT. */
export interface BackendPermissionScope {
  code: string;
  scope: 'TENANT' | 'BRANCH';
  /** Absent on a TENANT entry. */
  branch_ids?: readonly string[];
}

export interface BackendUserProfile {
  user_id: string;
  keycloak_subject: string;
  email: string | null;
  full_name: string | null;
  organisation: BackendProfileOrganisation | null;
  membership: BackendProfileMembership;
  selected_branch: BackendProfileBranch | null;
  branches: readonly BackendProfileBranch[];
  roles: readonly BackendProfileRole[];
  permissions: readonly string[];
  permission_scopes: readonly BackendPermissionScope[];
}

export type BackendProfile = BackendUserProfile;
