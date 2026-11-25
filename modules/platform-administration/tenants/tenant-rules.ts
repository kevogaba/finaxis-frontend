import { z } from 'zod';
import { can, type PermissionHolder } from '@/auth/permissions';
import type { StatusTone } from '@/components/data-display/status-chip';
import { isoToBusinessDate } from '@/lib/business-date';
import { isTimeZone, timeZones } from '@/modules/administration/branches/branch-rules';
import { isMaker } from '@/modules/administration/approvals/maker-checker';
import { currencyLabel } from '@/modules/administration/settings/settings-rules';
import type { BootstrapStatus, TenantDetail, TenantStatus } from './tenant-contract';

export { currencyLabel };

export type TenantLifecycleAction =
  'amend' | 'submit' | 'approve' | 'return' | 'reject' | 'suspend' | 'reactivate' | 'deprovision';

/** Hero order: the first action is the contained primary (tenant-lifecycle-actions.tsx), so the
 * forward action leads and an edit-like Amend follows, outlined. A pending request's recoverable
 * Return comes before its final Reject, as a branch's Return follows its Activate. */
const ACTIONS_BY_STATUS: Record<TenantStatus, readonly TenantLifecycleAction[]> = {
  DRAFT: ['submit', 'amend'],
  PENDING_APPROVAL: ['approve', 'return', 'reject'],
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
  // Platform #181 (BG-01): returning for changes is a checker's decision on `tenant.reject`.
  return: 'tenant.reject',
  reject: 'tenant.reject',
  suspend: 'tenant.suspend',
  reactivate: 'tenant.reactivate',
  deprovision: 'tenant.deprovision',
};

/**
 * Spec §11.2's hero lifecycle. Every tenant mutation reads the record back, so it also needs
 * `tenant.view` (BG-31). The request's makers see Approve, Return for changes and Reject disabled
 * (`blockedTenantActions`); an amender's refusal is explained when it comes (BG-08).
 */
export function availableTenantActions(
  status: TenantStatus,
  holder: PermissionHolder,
): TenantLifecycleAction[] {
  if (!can(holder, 'tenant.view')) return [];
  return ACTIONS_BY_STATUS[status].filter((action) => can(holder, PERMISSION[action]));
}

export const TENANT_MAKER_BLOCKED =
  'You requested or submitted this institution, so another platform administrator must decide it.';

/** BG-08 (TenantCheckerRule): its requester and its submitter never approve, return or reject it,
 * and no tenant switch relaxes the platform's own checker. An amender may still return it (the
 * platform refuses them only an approval or a rejection, by name). `callerId` null (no profile):
 * nothing blocks. */
export function blockedTenantActions(
  actions: readonly TenantLifecycleAction[],
  tenant: Pick<TenantDetail, 'requestedBy' | 'submittedBy'>,
  callerId: string | null,
): Partial<Record<TenantLifecycleAction, string>> {
  const maker =
    callerId !== null && isMaker([tenant.requestedBy?.id, tenant.submittedBy?.id], callerId);
  if (!maker) return {};
  return Object.fromEntries(
    actions
      .filter((action) => action === 'approve' || action === 'return' || action === 'reject')
      .map((action) => [action, TENANT_MAKER_BLOCKED]),
  );
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

const BOOTSTRAP_LABELS: Record<BootstrapStatus, string> = {
  DRAFT: 'Not started',
  PENDING_ACTIVATION: 'Waiting for approval',
  QUEUED: 'Queued',
  PROVISIONING_IDENTITY: 'Setting up the first administrator',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

/** The bootstrap in words: `humanizeEnum` reads "Draft" for a request that never
 * started provisioning, a rejected one included. */
export function bootstrapStatusLabel(status: BootstrapStatus): string {
  return BOOTSTRAP_LABELS[status];
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

/** `KE · Kenya`: the code first, like a currency (`KES · Kenyan Shilling`). */
export function countryLabel(code: string): string {
  return `${code} · ${countryName(code)}`;
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

/** The runtime's ISO 4217 codes, labelled with their names; a stored code it lacks goes first. */
function currencyOptions(current: string | undefined): TenantOption[] {
  return withCurrent(
    Intl.supportedValuesOf('currency').map((value) => ({ value, label: currencyLabel(value) })),
    current,
  );
}

export function tenantFormOptions(
  current?: Pick<TenantDetail, 'countryCode' | 'baseCurrencyCode' | 'timezone'>,
): TenantFormOptions {
  return {
    countries: withCurrent(countryOptions(), current?.countryCode),
    currencies: currencyOptions(current?.baseCurrencyCode),
    timeZones: timeZones(current?.timezone).map((value) => ({ value, label: value })),
  };
}

const TENANT_CODE = /^[a-z0-9-]{3,32}$/;

/** Empty means "not set": one string schema whose check allows `''`, never a union, so the
 * message is the field's own. */
const businessDate = z
  .string()
  .refine((value) => value === '' || isoToBusinessDate(value) !== null, 'Choose a valid date.');

/** CreateTenantDraft's institution, first administrator and first business date (contract §D):
 * the fields create and amend share. */
const draftFieldsSchema = z.object({
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
  businessDate,
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

/** The first administrator's fields: amend sends them together or not at all (BG-14). */
const ADMIN_FIELDS = [
  'adminEmail',
  'adminUsername',
  'adminDisplayName',
  'adminPhone',
  'adminSendApplicationInvite',
] as const;

/**
 * CreateTenantDraft (contract §D, §H), shared by the wizard (React Hook Form) and the create
 * action: the draft's fields, plus the catalogue settings only create seeds.
 */
export const tenantDraftSchema = draftFieldsSchema.extend({
  defaultTimezoneSetting: z
    .string()
    .refine((value) => value === '' || isTimeZone(value), 'Choose a timezone.'),
  // TenantSettingCatalog's bounds (#278): at least seven years, at most a century.
  auditRetentionDays: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' || (/^\d+$/.test(value) && Number(value) >= 2555 && Number(value) <= 36500),
      'Enter 2555 to 36500 days.',
    ),
});

/**
 * The amend wizard for a draft the platform keeps no first administrator for (its detail's `admin`
 * is `null`: no bootstrap record). The administrator fields stay empty and are never sent, since
 * the platform would discard them (`amendDraft` updates no row), so they aren't validated.
 */
export const tenantDraftWithoutAdministratorSchema = tenantDraftSchema.extend({
  adminEmail: z.string(),
  adminUsername: z.string(),
  adminDisplayName: z.string(),
  adminPhone: z.string(),
});

/**
 * AmendTenantDraft (BG-14), as `changedTenantFields` sends it: the five institution fields the
 * PATCH still requires, always; the legal name and registration number only when changed (`''`
 * clears one); the first administrator only when changed, and then whole; the business date only
 * when entered. Never settings: a non-empty `initial_settings` is a 422 on amend.
 */
export const tenantAmendSchema = draftFieldsSchema
  .partial({
    legalName: true,
    registrationNumber: true,
    businessDate: true,
    adminEmail: true,
    adminUsername: true,
    adminDisplayName: true,
    adminPhone: true,
    adminSendApplicationInvite: true,
  })
  .refine(
    (input) =>
      ADMIN_FIELDS.every((name) => input[name] === undefined) ||
      ADMIN_FIELDS.every((name) => input[name] !== undefined),
    { path: ['adminEmail'], error: 'Enter the first administrator in full.' },
  );

export type TenantDraftValues = z.infer<typeof tenantDraftSchema>;
export type TenantAmendValues = z.infer<typeof tenantAmendSchema>;

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
  auditRetentionDays: '',
};

/** The amend wizard's starting values: the draft as the platform returns it (BG-14). An absent
 * administrator starts empty: the amend page needs `tenant.update_draft` and a draft, so it is a
 * tenant without a bootstrap record, whose wizard asks for none
 * (`tenantDraftWithoutAdministratorSchema`). */
export function tenantAmendDefaults(
  tenant: Pick<
    TenantDetail,
    | 'tenantCode'
    | 'displayName'
    | 'legalName'
    | 'registrationNumber'
    | 'countryCode'
    | 'baseCurrencyCode'
    | 'timezone'
    | 'admin'
  >,
): TenantDraftValues {
  const { admin } = tenant;
  return {
    ...EMPTY_TENANT_DRAFT,
    tenantCode: tenant.tenantCode,
    displayName: tenant.displayName,
    legalName: tenant.legalName ?? '',
    registrationNumber: tenant.registrationNumber ?? '',
    countryCode: tenant.countryCode,
    baseCurrencyCode: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    ...(admin && {
      adminEmail: admin.email,
      adminUsername: admin.username,
      adminDisplayName: admin.displayName,
      adminPhone: admin.phoneE164 ?? '',
      adminSendApplicationInvite: admin.sendApplicationInvite ? 'true' : 'false',
    }),
  };
}

/**
 * What the amend wizard sends (`tenantAmendSchema`), all strings: the five required institution
 * fields; the legal name and registration number when they differ from the draft's; the five
 * administrator fields together when any differs; and the business date when one was entered (the
 * platform doesn't return it, so it can't be compared). Compared with the draft's values trimmed,
 * as the form trims.
 */
export function changedTenantFields(
  stored: TenantDraftValues,
  values: TenantDraftValues,
): Record<string, string> {
  const changes: Record<string, string> = {
    tenantCode: values.tenantCode,
    displayName: values.displayName,
    countryCode: values.countryCode,
    baseCurrencyCode: values.baseCurrencyCode,
    timezone: values.timezone,
  };
  const changed = (name: keyof TenantDraftValues) => values[name] !== stored[name].trim();
  if (changed('legalName')) changes.legalName = values.legalName;
  if (changed('registrationNumber')) changes.registrationNumber = values.registrationNumber;
  if (ADMIN_FIELDS.some(changed)) {
    for (const name of ADMIN_FIELDS) changes[name] = values[name];
  }
  if (values.businessDate) changes.businessDate = values.businessDate;
  return changes;
}

/** CreateTenantDraft, built field by field (spec §6.2: never spread form values). */
export function tenantDraftBody(values: TenantDraftValues): Record<string, unknown> {
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

/**
 * AmendTenantDraft (BG-14), built field by field: an absent `legal_name`, `registration_number`
 * or `admin` keeps the draft's, a `null` legal name or registration number clears it, and a sent
 * `admin` replaces the administrator whole (`send_application_invite` stated). `business_date`
 * only when entered; never `initial_settings`.
 */
export function tenantAmendBody(input: TenantAmendValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tenant_code: input.tenantCode,
    display_name: input.displayName,
    country_code: input.countryCode,
    base_currency_code: input.baseCurrencyCode,
    timezone: input.timezone,
  };
  if (input.legalName !== undefined) body.legal_name = input.legalName || null;
  if (input.registrationNumber !== undefined) {
    body.registration_number = input.registrationNumber || null;
  }
  // The schema's refinement sends the five together or none, so the email stands for them all.
  if (input.adminEmail !== undefined) {
    body.admin = {
      email: input.adminEmail,
      username: input.adminUsername,
      display_name: input.adminDisplayName,
      phone_e164: input.adminPhone,
      send_application_invite: input.adminSendApplicationInvite === 'true',
    };
  }
  const date = input.businessDate ? isoToBusinessDate(input.businessDate) : null;
  if (date) body.business_date = date;
  return body;
}

/** Catalogue keys only (contract §H), and only those filled in. The map is never re-keyed. Never
 * `base_currency`: it mirrors `base_currency_code`, and any other value is refused (422). */
export function initialSettings(values: TenantDraftValues): Record<string, string> {
  const settings: Record<string, string> = {};
  if (values.defaultTimezoneSetting) settings.default_timezone = values.defaultTimezoneSetting;
  if (values.auditRetentionDays) {
    settings.audit_retention_days = String(Number(values.auditRetentionDays));
  }
  return settings;
}
