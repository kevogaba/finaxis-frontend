import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from '@/lib/api/wire';

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

/** `sort_by` allow-list for `GET /platform/tenants` (contract §E.2); anything else is a 500. */
export const TENANT_SORT_FIELDS = [
  'displayName',
  'tenantCode',
  'countryCode',
  'createdAt',
] as const;
export type TenantSortField = (typeof TENANT_SORT_FIELDS)[number];

/** List items carry only these six fields (contract §C, spec §11.1). */
const tenantSummarySchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    country_code: z.string(),
    status: z.enum(TENANT_STATUSES),
    created_at: instantSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    countryCode: tenant.country_code,
    status: tenant.status,
    createdAt: tenant.created_at,
  }));

export type TenantSummary = z.output<typeof tenantSummarySchema>;

export const tenantPageSchema = pageSchema(tenantSummarySchema);

/** No legal name, registration number, first administrator or status reason: they are write-only
 * (BG-14). */
export const tenantDetailSchema = z
  .object({
    id: uuidSchema,
    tenant_code: z.string(),
    display_name: z.string(),
    country_code: z.string(),
    base_currency_code: z.string(),
    timezone: z.string(),
    status: z.enum(TENANT_STATUSES),
    bootstrap_status: z.enum(BOOTSTRAP_STATUSES).nullable(),
    bootstrap_failure_code: z.string().nullable(),
    created_at: instantSchema,
    updated_at: instantSchema,
  })
  .transform((tenant) => ({
    id: tenant.id,
    tenantCode: tenant.tenant_code,
    displayName: tenant.display_name,
    countryCode: tenant.country_code,
    baseCurrencyCode: tenant.base_currency_code,
    timezone: tenant.timezone,
    status: tenant.status,
    bootstrapStatus: tenant.bootstrap_status,
    bootstrapFailureCode: tenant.bootstrap_failure_code,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
  }));

export type TenantDetail = z.output<typeof tenantDetailSchema>;

// `status` stays a plain string: a create that succeeded must never fail on its echo.
export const tenantDraftResultSchema = z
  .object({ organisation_id: uuidSchema, status: z.string() })
  .transform((result) => ({ tenantId: result.organisation_id }));
