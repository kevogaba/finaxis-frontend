import { z } from 'zod';
import { actorRefSchema, instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

/** Organisation lifecycle (contract §F). */
export const TENANT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'DEPROVISIONING',
  'DEPROVISIONED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** The first administrator's bootstrap (contract §F). `null` for the platform organisation and for
 * SQL-seeded tenants. */
export const BOOTSTRAP_STATUSES = [
  'DRAFT',
  'PENDING_ACTIVATION',
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
] as const;
export type BootstrapStatus = (typeof BOOTSTRAP_STATUSES)[number];

/** `sort_by` allow-list for `GET /platform/tenants` (contract §E.2); anything else is a 400
 * (BG-26). */
export const TENANT_SORT_FIELDS = [
  'displayName',
  'tenantCode',
  'countryCode',
  'createdAt',
] as const;
export type TenantSortField = (typeof TENANT_SORT_FIELDS)[number];

/** The list item's fields this UI reads (contract §C, spec §11.1). The makers are shown to platform
 * callers only (BG-08). */
const tenantSummarySchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    country_code: z.string(),
    status: z.enum(TENANT_STATUSES),
    created_at: instantSchema,
    requested_by: actorRefSchema,
    submitted_by: actorRefSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    countryCode: tenant.country_code,
    status: tenant.status,
    createdAt: tenant.created_at,
    requestedBy: tenant.requested_by,
    submittedBy: tenant.submitted_by,
  }));

export type TenantSummary = z.output<typeof tenantSummarySchema>;

export const tenantPageSchema = pageSchema(tenantSummarySchema);

/** The first administrator as drafted (BG-14): what amend's `admin` takes. */
const administratorDraftSchema = z
  .object({
    email: z.string(),
    username: z.string(),
    display_name: z.string(),
    phone_e164: z.string().nullable(),
    send_application_invite: z.boolean(),
  })
  .transform((admin) => ({
    email: admin.email,
    username: admin.username,
    displayName: admin.display_name,
    phoneE164: admin.phone_e164,
    sendApplicationInvite: admin.send_application_invite,
  }));

export type AdministratorDraft = z.output<typeof administratorDraftSchema>;

/** BG-14: the legal name, registration number and status reason are always present, each `null`
 * when unset. `admin` is filled only for a holder of `tenant.update_draft` while the tenant is a
 * DRAFT (the people who would amend it), and `null` otherwise. */
export const tenantDetailSchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    legal_name: z.string().nullable(),
    registration_number: z.string().nullable(),
    country_code: z.string(),
    base_currency_code: z.string(),
    timezone: z.string(),
    status: z.enum(TENANT_STATUSES),
    status_reason: z.string().nullable(),
    bootstrap_status: z.enum(BOOTSTRAP_STATUSES).nullable(),
    bootstrap_failure_code: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
    admin: administratorDraftSchema.nullable(),
    requested_by: actorRefSchema,
    submitted_by: actorRefSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    legalName: tenant.legal_name,
    registrationNumber: tenant.registration_number,
    countryCode: tenant.country_code,
    baseCurrencyCode: tenant.base_currency_code,
    timezone: tenant.timezone,
    status: tenant.status,
    statusReason: tenant.status_reason,
    bootstrapStatus: tenant.bootstrap_status,
    bootstrapFailureCode: tenant.bootstrap_failure_code,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
    admin: tenant.admin,
    requestedBy: tenant.requested_by,
    submittedBy: tenant.submitted_by,
  }));

export type TenantDetail = z.output<typeof tenantDetailSchema>;

// `status` stays a plain string: a create that succeeded must never fail on its echo.
export const tenantDraftResultSchema = z
  .object({ organisation_id: uuidSchema, status: z.string() })
  .transform((result) => ({ tenantId: result.organisation_id }));

/** `GET /platform/approvals/pending-count` (BG-22, platform #169): the institutions pending approval
 * that the caller could approve, leaving out those they requested or submitted (the platform
 * checker's rule, never relaxed) and the platform organisation. Always sent to a holder of
 * `tenant.approve` (with `tenant.view`) in the platform organisation; read as the bare count. */
export const platformPendingCountSchema = z
  .object({ tenants: z.number().int().nonnegative() })
  .transform((body) => body.tenants);
