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
 * snake_case server-only types in auth/context.types.ts. The platform lists distinct, ACTIVE
 * branches, roles and assigned ids (BG-23), so they pass through as sent.
 */
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
  items: z.array(branch),
  page: pageMetadata,
});

export const selectOrganisationResponseSchema: z.ZodType<SelectOrganisationResponse> = z.object({
  organisation_id: z.string(),
  membership_id: z.string(),
  context_token: z.string(),
  context_header: z.string(),
  branch_id: z.string().nullable(),
  requires_branch_selection: z.boolean(),
  assigned_branch_ids: z.array(z.string()),
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
  branches: z.array(profileBranch),
  roles: z.array(profileRole),
  permissions: z.array(z.string()),
  permission_scopes: z.array(
    z.object({
      code: z.string(),
      scope: z.enum(['TENANT', 'BRANCH']),
      branch_ids: z.array(z.string()).optional(),
    }),
  ),
});
