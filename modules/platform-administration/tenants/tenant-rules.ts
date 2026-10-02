import { z } from 'zod';
import { can, type PermissionHolder } from '@/auth/permissions';
import type { StatusTone } from '@/components/data-display/status-chip';
import { isoToBusinessDate } from '@/lib/business-date';
import { isTimeZone } from '@/modules/administration/branches/branch-rules';
import { settingOptions } from '@/modules/administration/settings/settings-rules';
import type { BootstrapStatus, TenantDetail, TenantStatus } from './tenant-contract';

export { currencyLabel } from '@/modules/administration/settings/settings-rules';

export type TenantLifecycleAction =
  'amend' | 'submit' | 'approve' | 'reject' | 'suspend' | 'reactivate' | 'deprovision';

/** Hero order: the first action is the contained primary (tenant-lifecycle-actions.tsx), so the
 * forward action leads and an edit-like Amend follows, outlined. */
const ACTIONS_BY_STATUS: Record<TenantStatus, readonly TenantLifecycleAction[]> = {
  DRAFT: ['submit', 'amend'],
  PENDING_APPROVAL: ['approve', 'reject'],
  PROVISIONING: [],
  ACTIVE: ['suspend', 'deprovision'],
  SUSPENDED: ['reactivate', 'deprovision'],
  DEPROVISIONING: [],
  DEPROVISIONED: [],
  REJECTED: [],
  ARCHIVED: [],
};

const PERMISSION: Record<TenantLifecycleAction, string> = {
  amend: 'tenant.update_draft',
  submit: 'tenant.submit_for_approval',
  approve: 'tenant.approve',
  reject: 'tenant.reject',
  suspend: 'tenant.suspend',
  reactivate: 'tenant.reactivate',
  deprovision: 'tenant.deprovision',
};

/**
 * Spec §11.2's hero lifecycle. Every tenant mutation reads the record back, so it also needs
 * `tenant.view` (BG-31). Approve stays on offer for its maker: the platform context can't read who
 * created or submitted a request (BG-08), so a refusal is explained when it comes.
 */
export function availableTenantActions(
  status: TenantStatus,
  holder: PermissionHolder,
): TenantLifecycleAction[] {
  if (!can(holder, 'tenant.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, PERMISSION[action]));
}

/** Contract §E.2: a retry needs a FAILED bootstrap (else 409), and it reads the tenant back. */
export function canRetryBootstrap(
  bootstrapStatus: BootstrapStatus | null,
  holder: PermissionHolder,
): boolean {
  return (
    bootstrapStatus === 'FAILED' &&
    can(holder, 'tenant.bootstrap_retry') &&
    can(holder, 'tenant.view')
  );
}

export interface ProvisioningStep {
  label: string;
  detail: string;
  /** The step's chip: always a word, never colour alone (WCAG 1.4.1). */
  state: { label: string; tone: StatusTone };
}

const PROVISIONING_STEPS = [
  { label: 'Draft created', detail: 'The request and its first administrator are recorded.' },
  { label: 'Submitted for approval', detail: 'Sent to a different platform administrator.' },
  {
    label: 'Approved',
    detail: 'Activates the institution with its head office and default roles.',
  },
  {
    label: 'First administrator provisioned',
    detail: "Creates the administrator's identity and sends the invitation.",
  },
] as const;

const SUBMITTED: readonly BootstrapStatus[] = [
  'PENDING_ACTIVATION',
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
];
const APPROVED: readonly BootstrapStatus[] = [
  'QUEUED',
  'PROVISIONING_IDENTITY',
  'COMPLETED',
  'FAILED',
];

const DONE = { label: 'Done', tone: 'success' } as const;
const WAITING = { label: 'Waiting', tone: 'warning' } as const;
const IN_PROGRESS = { label: 'In progress', tone: 'warning' } as const;
const NOT_STARTED = { label: 'Not started', tone: 'default' } as const;

/**
 * The Provisioning tab's timeline (spec §11.2), derived from the lifecycle and bootstrap status.
 * `null` when the bootstrap isn't tracked (the platform organisation, SQL-seeded tenants). A rejected
 * request stops at approval; a failed bootstrap stops at the administrator's provisioning, which a
 * retry restarts (backend: submit → PENDING_ACTIVATION, approve → QUEUED, then the async job).
 */
export function provisioningTimeline(
  status: TenantStatus,
  bootstrap: BootstrapStatus | null,
): ProvisioningStep[] | null {
  if (bootstrap === null) return null;
  const rejected = status === 'REJECTED';
  const done = [
    true,
    rejected || SUBMITTED.includes(bootstrap),
    APPROVED.includes(bootstrap),
    bootstrap === 'COMPLETED',
  ];
  const stopped = rejected ? 2 : bootstrap === 'FAILED' ? 3 : -1;
  const next = stopped === -1 ? done.indexOf(false) : -1;
  return PROVISIONING_STEPS.map((step, index): ProvisioningStep => {
    if (index === stopped) {
      return rejected
        ? {
            label: step.label,
            detail: 'Rejected. A rejected request is final, and its tenant code stays taken.',
            state: { label: 'Rejected', tone: 'error' },
          }
        : { ...step, state: { label: 'Failed', tone: 'error' } };
    }
    if (done[index]) return { ...step, state: DONE };
    if (index === next) return { ...step, state: index === 3 ? IN_PROGRESS : WAITING };
    return { ...step, state: NOT_STARTED };
  });
}

/**
 * BG-29: `GET /platform/tenants` includes the reserved platform organisation, which the directory
 * hides. An unfiltered result always holds it; a filtered one is known to only when its row is on
 * the page in view. ponytail: a filtered count can read one high on pages without that row, and the
 * pagination footer keeps the backend's rows so that no page is stranded — exact once BG-29 closes.
 */
export function visibleTenantTotal(
  totalItems: number,
  filtered: boolean,
  platformOnPage: boolean,
): number {
  return Math.max(0, totalItems - (!filtered || platformOnPage ? 1 : 0));
}

export interface TenantOption {
  value: string;
  label: string;
}

/** The wizard's choices, built once on the server so that SSR and hydration list the same values. */
export interface TenantFormOptions {
  countries: readonly TenantOption[];
  currencies: readonly TenantOption[];
  timeZones: readonly TenantOption[];
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `Kenya`; the bare code when the runtime has no English name for it, or it isn't a region. */
export function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Regions `Intl` names that aren't countries to put on an institution. */
const NON_COUNTRIES: ReadonlySet<string> = new Set(['XA', 'XB', 'ZZ', 'QO', 'EU', 'EZ', 'UN']);

/**
 * Every country the runtime can name, sorted by name (contract §D: `^[A-Z]{2}$`; Intl has no region
 * list). Only canonical codes: `DisplayNames` also names withdrawn aliases (DD, UK, …) as their
 * current country, which would list it twice and let a retired code be stored.
 */
export function countryOptions(): TenantOption[] {
  const options: TenantOption[] = [];
  for (const first of LETTERS) {
    for (const second of LETTERS) {
      const code = `${first}${second}`;
      const name = REGION_NAMES.of(code);
      if (
        name &&
        name !== code &&
        !NON_COUNTRIES.has(code) &&
        Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`
      ) {
        options.push({ value: code, label: name });
      }
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/** A value the runtime doesn't list (a retired code, an alias) goes first, so that whatever
 * carries it still shows it: amend's stored country, or the directory's Country filter from the URL. */
export function withCurrent(options: TenantOption[], value: string | undefined): TenantOption[] {
  return value && !options.some((option) => option.value === value)
    ? [{ value, label: value }, ...options]
    : options;
}

export function tenantFormOptions(
  current?: Pick<TenantDetail, 'countryCode' | 'baseCurrencyCode' | 'timezone'>,
): TenantFormOptions {
  return {
    countries: withCurrent(countryOptions(), current?.countryCode),
    currencies: settingOptions('base_currency', current?.baseCurrencyCode ?? null),
    timeZones: settingOptions('default_timezone', current?.timezone ?? null),
  };
}

const TENANT_CODE = /^[a-z0-9-]{3,32}$/;

/** CreateTenantDraft's institution and first administrator (contract §D), shared by the wizard
 * (React Hook Form) and the Server Actions. Amend sends exactly these: it replaces every field. */
export const tenantAmendSchema = z.object({
  tenantCode: z
    .string()
    .trim()
    .regex(TENANT_CODE, 'Use 3–32 lowercase letters, digits or hyphens.'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  legalName: z.string().trim().max(100, 'Use at most 100 characters.'),
  registrationNumber: z.string().trim().max(50, 'Use at most 50 characters.'),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'Choose a country.'),
  baseCurrencyCode: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency.'),
  timezone: z.string().refine(isTimeZone, 'Choose a timezone.'),
  adminEmail: z.email('Enter a valid email address.'),
  adminUsername: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,50}$/, 'Use 3–50 letters, digits, dots, underscores or hyphens.'),
  adminDisplayName: z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Use at most 100 characters.'),
  // Required by the backend although it is typed nullable (spec §11.1).
  adminPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, 'Use the international format, e.g. +254712000140.'),
  adminSendApplicationInvite: z.enum(['true', 'false']),
});

/**
 * Create also seeds the first business date and catalogue settings (contract §D, §H); amend ignores
 * both. Empty means "not set". Each is one string schema whose check allows `''`, never a union, so
 * the message is the field's own.
 */
export const tenantDraftSchema = tenantAmendSchema.extend({
  businessDate: z
    .string()
    .refine((value) => value === '' || isoToBusinessDate(value) !== null, 'Choose a valid date.'),
  defaultTimezoneSetting: z
    .string()
    .refine((value) => value === '' || isTimeZone(value), 'Choose a timezone.'),
  baseCurrencySetting: z.string().regex(/^([A-Z]{3})?$/, 'Choose a currency.'),
  auditRetentionDays: z
    .string()
    .trim()
    .regex(/^(\d{1,5})?$/, 'Enter a whole number of days.'),
});

export type TenantAmendValues = z.infer<typeof tenantAmendSchema>;
export type TenantDraftValues = z.infer<typeof tenantDraftSchema>;

export const EMPTY_TENANT_DRAFT: TenantDraftValues = {
  tenantCode: '',
  displayName: '',
  legalName: '',
  registrationNumber: '',
  countryCode: '',
  baseCurrencyCode: '',
  timezone: '',
  businessDate: '',
  adminEmail: '',
  adminUsername: '',
  adminDisplayName: '',
  adminPhone: '',
  adminSendApplicationInvite: 'false',
  defaultTimezoneSetting: '',
  baseCurrencySetting: '',
  auditRetentionDays: '',
};

/** CreateTenantDraft / AmendTenantDraft, built field by field (spec §6.2: never spread form
 * values). */
export function tenantDraftBody(values: TenantAmendValues): Record<string, unknown> {
  return {
    tenant_code: values.tenantCode,
    display_name: values.displayName,
    legal_name: values.legalName || null,
    registration_number: values.registrationNumber || null,
    country_code: values.countryCode,
    base_currency_code: values.baseCurrencyCode,
    timezone: values.timezone,
    admin: {
      email: values.adminEmail,
      username: values.adminUsername,
      display_name: values.adminDisplayName,
      phone_e164: values.adminPhone,
      send_application_invite: values.adminSendApplicationInvite === 'true',
    },
  };
}

/** Catalogue keys only (contract §H), and only those filled in. The map is never re-keyed. */
export function initialSettings(values: TenantDraftValues): Record<string, string> {
  const settings: Record<string, string> = {};
  if (values.defaultTimezoneSetting) settings.default_timezone = values.defaultTimezoneSetting;
  if (values.baseCurrencySetting) settings.base_currency = values.baseCurrencySetting;
  if (values.auditRetentionDays) {
    settings.audit_retention_days = String(Number(values.auditRetentionDays));
  }
  return settings;
}
