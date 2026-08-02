import type {
  BackendBranch,
  BackendOrganisation,
  Page,
  PageMetadata,
  SelectBranchResponse,
  SelectOrganisationResponse,
} from '@/auth/context.types';

export interface BrowserPageMetadata {
  number: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface BrowserPage<T> {
  items: readonly T[];
  page: BrowserPageMetadata;
}

export interface BrowserOrganisation {
  organisationId: string;
  membershipId: string;
  tenantCode: string;
  displayName: string;
  organisationStatus: string;
  membershipStatus: string;
}

export interface BrowserBranch {
  branchId: string;
  branchCode: string;
  branchName: string;
  branchStatus: string;
}

export interface BrowserOrganisationSelection {
  organisationId: string;
  membershipId: string;
  branchId: string | null;
  requiresBranchSelection: boolean;
  assignedBranchIds: readonly string[];
}

export interface BrowserBranchSelection {
  organisationId: string;
  membershipId: string;
  branchId: string;
}

function toBrowserPageMetadata(page: PageMetadata): BrowserPageMetadata {
  return {
    hasNext: page.has_next,
    hasPrevious: page.has_previous,
    number: page.number,
    size: page.size,
    totalItems: page.total_items,
    totalPages: page.total_pages,
  };
}

export function toBrowserOrganisationPage(
  organisations: Page<BackendOrganisation>,
): BrowserPage<BrowserOrganisation> {
  return {
    items: organisations.items.map((organisation) => ({
      displayName: organisation.display_name,
      membershipId: organisation.membership_id,
      membershipStatus: organisation.membership_status,
      organisationId: organisation.organisation_id,
      organisationStatus: organisation.organisation_status,
      tenantCode: organisation.tenant_code,
    })),
    page: toBrowserPageMetadata(organisations.page),
  };
}

export function toBrowserBranchPage(branches: Page<BackendBranch>): BrowserPage<BrowserBranch> {
  return {
    items: branches.items.map((branch) => ({
      branchCode: branch.branch_code,
      branchId: branch.branch_id,
      branchName: branch.branch_name,
      branchStatus: branch.branch_status,
    })),
    page: toBrowserPageMetadata(branches.page),
  };
}

export function toBrowserOrganisationSelection(
  selection: SelectOrganisationResponse,
): BrowserOrganisationSelection {
  return {
    assignedBranchIds: selection.assigned_branch_ids,
    branchId: selection.branch_id,
    membershipId: selection.membership_id,
    organisationId: selection.organisation_id,
    requiresBranchSelection: selection.requires_branch_selection,
  };
}

export function toBrowserBranchSelection(selection: SelectBranchResponse): BrowserBranchSelection {
  return {
    branchId: selection.branch_id,
    membershipId: selection.membership_id,
    organisationId: selection.organisation_id,
  };
}
