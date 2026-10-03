import { randomUUID } from 'node:crypto';
import { requireContext, requirePermission, requirePlatformContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import {
  objectBody,
  pageOf,
  parseInstantParam,
  problem,
  readBody,
  sendJson,
  stringField,
} from '../http.mts';
import type { Violation } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeOrganisation } from '../state.mts';

const SORTS: Record<string, (tenant: FakeOrganisation) => string> = {
  tenantCode: (tenant) => tenant.code,
  displayName: (tenant) => tenant.displayName,
  countryCode: (tenant) => tenant.countryCode,
  createdAt: (tenant) => tenant.createdAt,
};

/** Contract §D: CreateTenantDraft, whose shape AmendTenantDraft repeats. */
const DRAFT_KEYS = [
  'tenant_code',
  'display_name',
  'legal_name',
  'registration_number',
  'country_code',
  'base_currency_code',
  'timezone',
  'admin',
  'initial_settings',
  'business_date',
];
/** Contract §D: InitialAdmin. */
const ADMIN_KEYS = ['email', 'username', 'display_name', 'phone_e164', 'send_application_invite'];
/** Contract §H: initial settings take catalogue keys only. */
const CATALOGUE_KEYS = [
  'default_timezone',
  'base_currency',
  'require_maker_checker_for_user_invites',
  'require_maker_checker_for_branch_creation',
  'business_date_auto_advance_enabled',
  'audit_retention_days',
];
const TENANT_CODE = /^[a-z0-9-]{3,32}$/;
const USERNAME = /^[a-zA-Z0-9._-]{3,50}$/;
const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_DATE = /^\d{2}-\d{2}-\d{4}$/;

const invalidJson = () => problem(400, 'invalid_json', 'Malformed request body.');
const invalidOperation = () => problem(422, 'invalid_operation', 'The operation is not valid.');
// BG-07: a duplicate tenant code, an unknown sort, and an unknown tenant on reject or suspend all
// surface as a 500.
const internalError = () => problem(500, 'internal_error', 'An unexpected error occurred.');
const tenantNotFound = () => problem(404, 'resource_not_found', 'Tenant not found.');

/**
 * Mirrors FoundationQueryService.validateSort: unknown sort → 500 internal_error. `sort_by` is
 * user-controlled, so the allow-list is read with `Object.hasOwn`: `toString` must not resolve to
 * an `Object.prototype` member.
 */
function sortTenants(tenants: FakeOrganisation[], query: URLSearchParams): FakeOrganisation[] {
  const sortBy = query.get('sort_by') ?? 'createdAt';
  const direction = (query.get('sort_dir') ?? 'DESC').toUpperCase();
  const key = Object.hasOwn(SORTS, sortBy) ? SORTS[sortBy] : undefined;
  if (!key || (direction !== 'ASC' && direction !== 'DESC')) {
    throw internalError();
  }
  const sorted = [...tenants].sort((a, b) => key(a).localeCompare(key(b)));
  return direction === 'DESC' ? sorted.reverse() : sorted;
}

function summary(tenant: FakeOrganisation) {
  return {
    id: tenant.id,
    tenant_code: tenant.code,
    display_name: tenant.displayName,
    country_code: tenant.countryCode,
    status: tenant.status,
    created_at: tenant.createdAt,
  };
}

function detail(tenant: FakeOrganisation) {
  return {
    ...summary(tenant),
    base_currency_code: tenant.baseCurrencyCode,
    timezone: tenant.timezone,
    bootstrap_status: tenant.bootstrapStatus,
    bootstrap_failure_code: tenant.bootstrapFailureCode,
    updated_at: tenant.updatedAt,
  };
}

function platformAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requirePlatformContext(access);
  return access;
}

function findTenant(context: RouteContext): FakeOrganisation {
  const tenant = context.state.organisations.find(
    (candidate) => candidate.id === context.params.tenant_id,
  );
  if (!tenant) throw tenantNotFound();
  return tenant;
}

function isZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function checkInitialSettings(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw invalidJson();
  for (const [key, setting] of Object.entries(value as Record<string, unknown>)) {
    if (typeof setting !== 'string') throw invalidJson();
    // Catalogue keys only, with typed values (contract §D, §H): anything else is a 422.
    if (!CATALOGUE_KEYS.includes(key)) throw invalidOperation();
    if (key === 'audit_retention_days' && !/^\d+$/.test(setting)) throw invalidOperation();
  }
}

function checkBusinessDate(value: unknown): void {
  if (value === undefined || value === null) return;
  // Strict dd-MM-yyyy (contract §A); anything else fails to bind.
  if (typeof value !== 'string' || !BUSINESS_DATE.test(value)) throw invalidJson();
}

interface DraftFields {
  code: string;
  displayName: string;
  countryCode: string;
  baseCurrencyCode: string;
  timezone: string;
}

/**
 * Mirrors the draft DTOs' bean validation (contract §D): an absent non-null field is `invalid_json`;
 * a blank or malformed value, and the admin's phone (typed nullable but `@NotBlank`), is a
 * `validation_failed` violation. The service's 422s come next: an unknown ZoneId, an unsettleable
 * currency and, on create only, a non-catalogue or mistyped initial setting (amend ignores
 * `initial_settings` and `business_date`).
 */
function draftFields(body: Record<string, unknown>, options: { amend: boolean }): DraftFields {
  const admin = objectBody(body.admin, ADMIN_KEYS);
  const code = stringField(body, 'tenant_code', { required: true }) ?? '';
  const displayName = stringField(body, 'display_name', { required: true }) ?? '';
  const legalName = stringField(body, 'legal_name', { required: false }) ?? '';
  const registration = stringField(body, 'registration_number', { required: false }) ?? '';
  const countryCode = stringField(body, 'country_code', { required: true }) ?? '';
  const baseCurrencyCode = stringField(body, 'base_currency_code', { required: true }) ?? '';
  const timezone = stringField(body, 'timezone', { required: true }) ?? '';
  const email = stringField(admin, 'email', { required: true }) ?? '';
  const username = stringField(admin, 'username', { required: true }) ?? '';
  const adminName = stringField(admin, 'display_name', { required: true }) ?? '';
  const phone = stringField(admin, 'phone_e164', { required: false });
  const invite = admin.send_application_invite;
  if (invite !== undefined && typeof invite !== 'boolean') throw invalidJson();

  const violations: Violation[] = [];
  const check = (valid: boolean, field: string, rule: string, message: string) => {
    if (!valid) violations.push({ field, code: rule, message });
  };
  check(
    TENANT_CODE.test(code),
    'tenant_code',
    'Pattern',
    'Tenant code must be 3-32 lowercase alphanumeric characters or hyphens.',
  );
  check(
    displayName.trim().length >= 2 && displayName.length <= 100,
    'display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(legalName.length <= 100, 'legal_name', 'Size', 'size must be between 0 and 100');
  check(registration.length <= 50, 'registration_number', 'Size', 'size must be between 0 and 50');
  check(
    /^[A-Z]{2}$/.test(countryCode),
    'country_code',
    'Pattern',
    'Country code must be 2 uppercase ISO letters.',
  );
  check(
    /^[A-Z]{3}$/.test(baseCurrencyCode),
    'base_currency_code',
    'Pattern',
    'Currency code must be 3 uppercase ISO letters.',
  );
  check(timezone.trim().length > 0, 'timezone', 'NotBlank', 'must not be blank');
  check(EMAIL.test(email), 'admin.email', 'Email', 'must be a well-formed email address');
  check(
    USERNAME.test(username),
    'admin.username',
    'Pattern',
    'must match "^[a-zA-Z0-9._-]{3,50}$"',
  );
  check(
    adminName.trim().length >= 2 && adminName.length <= 100,
    'admin.display_name',
    'Size',
    'size must be between 2 and 100',
  );
  check(
    phone !== null && E164.test(phone),
    'admin.phone_e164',
    phone === null ? 'NotBlank' : 'Pattern',
    phone === null ? 'must not be blank' : 'Phone must be in E.164 format.',
  );
  if (violations.length > 0) {
    throw problem(400, 'validation_failed', 'Validation failed.', violations);
  }
  if (!isZone(timezone)) throw invalidOperation();
  const currencies = Intl.supportedValuesOf('currency');
  if (baseCurrencyCode === 'XXX' || !currencies.includes(baseCurrencyCode)) {
    throw problem(422, 'accounting.currency_invalid', 'The currency is not valid.');
  }
  if (!options.amend) {
    checkInitialSettings(body.initial_settings);
    checkBusinessDate(body.business_date);
  }
  return { code, displayName, countryCode, baseCurrencyCode, timezone };
}

interface TransitionOptions {
  /** `none`: the endpoint has no body, and never reads one (contract §E.2). */
  reason: 'none' | 'optional' | 'required';
  status?: number;
  /** BG-07: reject and suspend answer an unknown tenant with a 500, not a 404. */
  unknownIs500?: boolean;
}

function transition(
  path: string,
  permission: string,
  allowed: (tenant: FakeOrganisation) => boolean,
  apply: (tenant: FakeOrganisation, access: AccessContext) => void,
  options: TransitionOptions,
): Route {
  return route('POST', `/api/v1/platform/tenants/:tenant_id/${path}`, async (context) => {
    const access = platformAccess(context);
    requirePermission(access, permission);
    requirePermission(access, 'tenant.view'); // read-back (BG-31)
    const tenant = context.state.organisations.find(
      (candidate) => candidate.id === context.params.tenant_id,
    );
    if (!tenant) {
      throw options.unknownIs500 ? internalError() : tenantNotFound();
    }
    let body: Record<string, unknown> = {};
    if (options.reason !== 'none') {
      const raw = await readBody(context.req);
      if (raw !== undefined || options.reason === 'required') body = objectBody(raw, ['reason']);
    }
    const reason = stringField(body, 'reason', { required: options.reason === 'required' });
    if (
      options.reason === 'required' &&
      (reason === null || reason.trim().length < 3 || reason.length > 500)
    ) {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'reason', code: 'Size', message: 'size must be between 3 and 500' },
      ]);
    }
    sendIdempotent(
      context,
      body,
      () => {
        if (!allowed(tenant)) {
          throw problem(409, 'conflict', `This transition isn't allowed from ${tenant.status}.`);
        }
        apply(tenant, access);
        tenant.updatedAt = new Date().toISOString();
        // ponytail: no audit row — platform actions land in the tenant's log, which nothing in the
        // platform workspace reads (BG-06). Add one when a platform audit view exists.
        return detail(tenant);
      },
      options.status,
    );
  });
}

export const platformTenantRoutes: Route[] = [
  route('GET', '/api/v1/platform/tenants', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.view');
    const { query } = context;
    const q = query.get('q')?.toLowerCase();
    const status = query.get('status');
    const country = query.get('country');
    const createdFrom = parseInstantParam(query, 'created_from');
    const createdTo = parseInstantParam(query, 'created_to');
    const tenants = context.state.organisations.filter(
      (tenant) =>
        (!q ||
          tenant.code.toLowerCase().includes(q) ||
          tenant.displayName.toLowerCase().includes(q)) &&
        (!status || tenant.status === status) &&
        (!country || tenant.countryCode === country) &&
        (createdFrom === undefined || Date.parse(tenant.createdAt) >= createdFrom) &&
        (createdTo === undefined || Date.parse(tenant.createdAt) <= createdTo),
    );
    sendJson(context.res, 200, pageOf(sortTenants(tenants, query).map(summary), query));
  }),

  route('GET', '/api/v1/platform/tenants/:tenant_id', (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.view');
    sendJson(context.res, 200, detail(findTenant(context)));
  }),

  route('POST', '/api/v1/platform/tenants', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.create');
    const body = objectBody(await readBody(context.req), DRAFT_KEYS);
    const draft = draftFields(body, { amend: false });
    sendIdempotent(
      context,
      body,
      () => {
        const { organisations } = context.state;
        if (organisations.some((candidate) => candidate.code === draft.code)) {
          throw internalError();
        }
        const now = new Date().toISOString();
        const created: FakeOrganisation = {
          id: randomUUID(),
          code: draft.code,
          displayName: draft.displayName,
          countryCode: draft.countryCode,
          baseCurrencyCode: draft.baseCurrencyCode,
          timezone: draft.timezone,
          status: 'DRAFT',
          bootstrapStatus: 'DRAFT',
          bootstrapFailureCode: null,
          createdAt: now,
          updatedAt: now,
          createdBy: access.claims.userId,
        };
        organisations.push(created);
        return { organisation_id: created.id, status: 'DRAFT' };
      },
      201,
    );
  }),

  route('PATCH', '/api/v1/platform/tenants/:tenant_id', async (context) => {
    const access = platformAccess(context);
    requirePermission(access, 'tenant.update_draft');
    requirePermission(access, 'tenant.view'); // read-back (BG-31)
    const tenant = findTenant(context);
    const body = objectBody(await readBody(context.req), DRAFT_KEYS);
    const draft = draftFields(body, { amend: true });
    sendIdempotent(context, body, () => {
      if (tenant.status !== 'DRAFT') {
        throw problem(409, 'conflict', 'Only a draft can be amended.');
      }
      const { organisations } = context.state;
      if (
        draft.code !== tenant.code &&
        organisations.some((candidate) => candidate.code === draft.code)
      ) {
        throw internalError();
      }
      // Replaces every field (contract §D); the legal name, registration and admin stay write-only.
      tenant.code = draft.code;
      tenant.displayName = draft.displayName;
      tenant.countryCode = draft.countryCode;
      tenant.baseCurrencyCode = draft.baseCurrencyCode;
      tenant.timezone = draft.timezone;
      tenant.updatedAt = new Date().toISOString();
      return detail(tenant);
    });
  }),

  transition(
    'submit',
    'tenant.submit_for_approval',
    (tenant) => tenant.status === 'DRAFT',
    (tenant, access) => {
      tenant.status = 'PENDING_APPROVAL';
      tenant.bootstrapStatus = 'PENDING_ACTIVATION';
      tenant.submittedBy = access.claims.userId;
    },
    { reason: 'none' },
  ),
  transition(
    'approve',
    'tenant.approve',
    (tenant) => tenant.status === 'PENDING_APPROVAL',
    (tenant, access) => {
      // Maker-checker (contract §E.2): never the creator or the submitter, with the same 403 as a
      // missing permission (BG-08).
      const actor = access.claims.userId;
      if (tenant.createdBy === actor || tenant.submittedBy === actor) {
        throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
      }
      // ACTIVE in the same transaction (via PROVISIONING); the first administrator is queued.
      tenant.status = 'ACTIVE';
      tenant.bootstrapStatus = 'QUEUED';
    },
    { reason: 'none', status: 202 },
  ),
  transition(
    'reject',
    'tenant.reject',
    (tenant) => tenant.status === 'PENDING_APPROVAL',
    (tenant) => {
      tenant.status = 'REJECTED';
      tenant.bootstrapStatus = 'DRAFT';
    },
    { reason: 'required', unknownIs500: true },
  ),
  transition(
    'suspend',
    'tenant.suspend',
    (tenant) => tenant.status === 'ACTIVE',
    (tenant) => {
      tenant.status = 'SUSPENDED';
    },
    { reason: 'required', unknownIs500: true },
  ),
  transition(
    'reactivate',
    'tenant.reactivate',
    (tenant) => tenant.status === 'SUSPENDED',
    (tenant) => {
      tenant.status = 'ACTIVE';
    },
    { reason: 'optional' },
  ),
  transition(
    'deprovision',
    'tenant.deprovision',
    (tenant) => tenant.status === 'ACTIVE' || tenant.status === 'SUSPENDED',
    (tenant) => {
      tenant.status = 'DEPROVISIONED';
    },
    { reason: 'required' },
  ),
  transition(
    'bootstrap/retry',
    'tenant.bootstrap_retry',
    (tenant) => tenant.bootstrapStatus === 'FAILED',
    (tenant) => {
      // The backend reruns the bootstrap at once; the identity provisioning then proceeds async.
      tenant.bootstrapStatus = 'PROVISIONING_IDENTITY';
      tenant.bootstrapFailureCode = null;
    },
    { reason: 'none', status: 202 },
  ),
];
