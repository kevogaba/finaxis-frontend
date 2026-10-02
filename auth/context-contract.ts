import { z } from 'zod';
import type {
  BackendBranch,
  BackendOrganisation,
  BackendProfile,
  Page,
  SelectBranchResponse,
  SelectOrganisationResponse,
} from '@/auth/context.types';

/**
 * Runtime validation for the `/api/v1/auth/*` wire shapes (contract §C). Outputs keep the
 * snake_case server-only types in auth/context.types.ts. The backend returns one row per
 * assignment, so branches/roles/assigned ids are de-duplicated here.
 */
function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

const pageMetadata = z.object({
  number: z.number().int(),
  size: z.number().int(),
  total_items: z.number().int(),
  total_pages: z.number().int(),
  has_next: z.boolean(),
  has_previous: z.boolean(),
});

const organisation = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  tenant_code: z.string(),
  display_name: z.string(),
  organisation_status: z.string(),
  membership_status: z.string(),
});

const branch = z.object({
  branch_id: z.string(),
  branch_code: z.string(),
  branch_name: z.string(),
  branch_status: z.string(),
});

const profileBranch = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
});
const profileRole = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
});

export const organisationPageSchema: z.ZodType<Page<BackendOrganisation>> = z.object({
  items: z.array(organisation),
  page: pageMetadata,
});

export const branchPageSchema: z.ZodType<Page<BackendBranch>> = z.object({
  items: z.array(branch).transform((items) => uniqueBy(items, (item) => item.branch_id)),
  page: pageMetadata,
});

export const selectOrganisationResponseSchema: z.ZodType<SelectOrganisationResponse> = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  context_token: z.string(),
  context_header: z.string(),
  branch_id: z.string().nullable(),
  requires_branch_selection: z.boolean(),
  assigned_branch_ids: z.array(z.string()).transform((ids) => [...new Set(ids)]),
});

export const selectBranchResponseSchema: z.ZodType<SelectBranchResponse> = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  branch_id: z.string(),
  context_token: z.string(),
  context_header: z.string(),
});

export const profileSchema: z.ZodType<BackendProfile> = z.object({
  user_id: z.string(),
  keycloak_subject: z.string(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
  organisation: profileBranch.nullable(),
  membership: z.object({ id: z.string(), status: z.string() }),
  selected_branch: profileBranch.nullable(),
  branches: z.array(profileBranch).transform((items) => uniqueBy(items, (item) => item.id)),
  roles: z.array(profileRole).transform((items) => uniqueBy(items, (item) => item.id)),
  permissions: z.array(z.string()),
});
