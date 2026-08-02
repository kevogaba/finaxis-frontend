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
  branch_id: string;
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
}

export type BackendProfile = BackendUserProfile;
