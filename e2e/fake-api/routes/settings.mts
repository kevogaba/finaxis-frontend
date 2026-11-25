import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { recordAuditEvent } from '../audit-log.mts';
import {
  isIanaZone,
  objectBody,
  pageOf,
  problem,
  readBody,
  sendJson,
  stringField,
} from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeTenantSetting, RunState } from '../state.mts';

const BASE = '/api/v1/tenant/settings';
const MASK = '***REDACTED***';
const BASE_CURRENCY = 'base_currency';
const AUTO_ADVANCE = 'business_date_auto_advance_enabled';
/** TenantSettingCatalog.makerCheckerKeys: changing one is audited HIGH. */
const MAKER_CHECKER = new Set([
  'require_maker_checker_for_user_invites',
  'require_maker_checker_for_branch_creation',
]);
/** TenantSettingCatalog.internalKeys: the platform's own rows, which reads treat as absent. */
const INTERNAL = new Set(['settings.operational']);

interface Definition {
  valueType: 'TIMEZONE' | 'CURRENCY' | 'BOOLEAN' | 'INT';
  platformAdminOnly: boolean;
  defaultValue: string | null;
  label: string;
  description: string;
  group: string;
}

/** lifecycle/domain/TenantSettingCatalog.kt @ 6a8ea28, metadata verbatim. A Map, so `toString` is
 * never a key. */
const CATALOGUE = new Map<string, Definition>([
  [
    'default_timezone',
    {
      valueType: 'TIMEZONE',
      platformAdminOnly: false,
      defaultValue: null,
      label: 'Default time zone',
      description:
        "The time zone a new branch takes when it is created without one. Unset, a new branch takes the organisation's own time zone, which alone decides the business date.",
      group: 'General',
    },
  ],
  [
    BASE_CURRENCY,
    {
      valueType: 'CURRENCY',
      platformAdminOnly: false,
      defaultValue: null,
      label: 'Base currency',
      description:
        "The currency the ledger posts in. Read-only: it mirrors the organisation's base currency and cannot be changed here.",
      group: 'General',
    },
  ],
  [
    'require_maker_checker_for_user_invites',
    {
      valueType: 'BOOLEAN',
      platformAdminOnly: false,
      defaultValue: 'true',
      label: 'Require maker-checker for user invitations',
      description:
        'When on, the person who invited a member and the invited user cannot approve the membership. Turning it off lets them; each such approval is audited as high severity. The platform checker is never relaxed.',
      group: 'Approvals',
    },
  ],
  [
    'require_maker_checker_for_branch_creation',
    {
      valueType: 'BOOLEAN',
      platformAdminOnly: false,
      defaultValue: 'true',
      label: 'Require maker-checker for branch creation',
      description:
        'When on, the person who created a branch and anyone who amended it cannot approve it. Turning it off lets them; each such approval is audited as high severity. The platform checker is never relaxed.',
      group: 'Approvals',
    },
  ],
  [
    AUTO_ADVANCE,
    {
      valueType: 'BOOLEAN',
      platformAdminOnly: false,
      defaultValue: 'false',
      label: 'Advance the business date automatically',
      description:
        "When true, the platform advances an open business date one day at a time until it reaches the organisation's local date, without a manual request, once the platform operator has switched scheduled advances on. Switching it on needs business_date.advance.",
      group: 'Business date',
    },
  ],
  [
    'audit_retention_days',
    {
      valueType: 'INT',
      platformAdminOnly: true,
      defaultValue: null,
      label: 'Audit retention (days)',
      description:
        'How many days audit events are kept. Unset keeps them for good. Once the platform operator turns the retention job on, routine successful events older than this are deleted; refused, failed and high-severity events are kept. At least 2555 days (seven years). Platform administrators only.',
      group: 'Audit',
    },
  ],
]);

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

/** Stored rows the tenant can see: never the platform's internal ones. */
function rowsOf(context: RouteContext, access: AccessContext): FakeTenantSetting[] {
  return context.state.tenantSettings.filter(
    (row) => row.organisationId === access.organisation.id && !INTERNAL.has(row.key),
  );
}

const rowOf = (context: RouteContext, access: AccessContext, key: string) =>
  rowsOf(context, access).find((row) => row.key === key);

/**
 * TenantSettingsService.view plus list's masking. `base_currency` answers from the organisation's
 * column, so it is never a default. A tenant context never holds the PLATFORM organisation's
 * `tenant_setting.manage_platform`, so a stored platform-only value is masked; an unset one is null.
 */
function toWire(access: AccessContext, key: string, row: FakeTenantSetting | undefined) {
  const definition = CATALOGUE.get(key);
  const raw = key === BASE_CURRENCY ? access.organisation.baseCurrencyCode : (row?.value ?? null);
  const value = raw ?? definition?.defaultValue ?? null;
  const sensitive = row?.sensitive ?? false;
  const platformAdminOnly = definition?.platformAdminOnly ?? false;
  return {
    key,
    value: value !== null && (platformAdminOnly || sensitive) ? MASK : value,
    value_type: definition?.valueType ?? row?.valueType ?? 'STRING',
    sensitive,
    platform_admin_only: platformAdminOnly,
    is_default: raw === null,
    label: definition?.label ?? null,
    description: definition?.description ?? null,
    group: definition?.group ?? null,
  };
}

/** MakerCheckerPolicy: segregation is on unless the tenant stored the literal `false`. */
export function makerCheckerRequired(
  state: RunState,
  organisationId: string,
  key: string,
): boolean {
  const row = state.tenantSettings.find(
    (candidate) => candidate.organisationId === organisationId && candidate.key === key,
  );
  return row?.value !== 'false';
}

/** The service's order: unknown key → 422, platform-only → 403, `settings.update` (and its view)
 * → 403, then `base_currency` → 422. (A non-ACTIVE organisation's 409 comes first on the platform,
 * but the context check refuses it here before any route runs.) */
function writable(access: AccessContext, key: string): Definition {
  const definition = CATALOGUE.get(key);
  if (!definition) {
    throw problem(422, 'invalid_operation', 'Unknown tenant setting key.');
  }
  if (definition.platformAdminOnly) {
    throw problem(403, 'forbidden', 'Missing permission: tenant_setting.manage_platform.');
  }
  requirePermission(access, 'settings.update');
  if (key === BASE_CURRENCY) {
    throw problem(
      422,
      'invalid_operation',
      "base_currency is derived from the organisation's base currency and cannot be changed here.",
    );
  }
  return definition;
}

const invalidValue = () =>
  problem(422, 'invalid_operation', 'The value is not valid for this setting.');

/** TenantSettingCatalog.canonicalize for the keys a tenant may write (BOOLEAN and TIMEZONE). */
function canonical(definition: Definition, raw: string): string {
  const value = raw.trim();
  if (definition.valueType === 'BOOLEAN') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') throw invalidValue();
    return lower;
  }
  if (!isIanaZone(value)) throw invalidValue();
  return value;
}

function audit(
  context: RouteContext,
  access: AccessContext,
  key: string,
  before: string | null,
  after: string | null,
  reason: string | null,
): void {
  recordAuditEvent(context.state, access, {
    entityType: 'ORGANISATION_SETTING',
    entityId: key,
    action: 'settings.update',
    reason,
    severity: MAKER_CHECKER.has(key) ? 'HIGH' : 'INFO',
    beforeJson: JSON.stringify({ [key]: before }),
    afterJson: JSON.stringify({ [key]: after }),
  });
}

export const settingsRoutes: Route[] = [
  route('GET', BASE, (context) => {
    const access = tenantAccess(context);
    requirePermission(access, 'settings.view');
    const rows = rowsOf(context, access);
    // Catalogue keys plus stored extras, sorted by key like the service.
    const keys = [...new Set([...CATALOGUE.keys(), ...rows.map((row) => row.key)])].sort();
    const items = keys.map((key) =>
      toWire(
        access,
        key,
        rows.find((row) => row.key === key),
      ),
    );
    sendJson(context.res, 200, pageOf(items, context.query));
  }),

  // TenantSettingsService.get: each key's own permission before the stored row is read (a
  // platform-only key needs the platform permission a tenant context never holds), then 422 for a
  // key neither in the catalogue nor stored. Sensitive values are masked; nothing stored here is.
  route('GET', `${BASE}/:key`, (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    if (CATALOGUE.get(key)?.platformAdminOnly) {
      throw problem(403, 'forbidden', 'Missing permission: tenant_setting.manage_platform.');
    }
    requirePermission(access, 'settings.view');
    const row = rowOf(context, access, key);
    if (!CATALOGUE.has(key) && !row) {
      throw problem(422, 'invalid_operation', 'Unknown tenant setting key.');
    }
    sendJson(context.res, 200, toWire(access, key, row));
  }),

  route('PUT', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    const body = objectBody(await readBody(context.req), ['value', 'reason']);
    const raw = stringField(body, 'value', { required: true }) ?? '';
    const reason = stringField(body, 'reason', { required: false });
    if (raw.trim() === '') {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'value', code: 'NotBlank', message: 'must not be blank' },
      ]);
    }
    const definition = writable(access, key);
    const value = canonical(definition, raw);
    // Storing `true` hands the advance to the platform, so it needs the caller's own authority.
    if (key === AUTO_ADVANCE && value === 'true')
      requirePermission(access, 'business_date.advance');
    sendIdempotent(context, body, () => {
      const row = rowOf(context, access, key);
      audit(context, access, key, row?.value ?? null, value, reason);
      if (row) {
        row.value = value;
      } else {
        context.state.tenantSettings.push({
          organisationId: access.organisation.id,
          key,
          value,
          valueType: definition.valueType,
          sensitive: false,
        });
      }
      return toWire(access, key, rowOf(context, access, key));
    });
  }),

  route('DELETE', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    // The body is optional (contract §D); an absent one fingerprints like `{}`.
    const body = objectBody((await readBody(context.req)) ?? {}, ['reason']);
    const reason = stringField(body, 'reason', { required: false });
    writable(access, key);
    sendIdempotent(
      context,
      body,
      () => {
        // 204 even when nothing was stored, with no audit row (TenantSettingsService.deactivate).
        const row = rowOf(context, access, key);
        if (row) {
          audit(context, access, key, row.value, null, reason);
          context.state.tenantSettings = context.state.tenantSettings.filter(
            (candidate) => candidate !== row,
          );
        }
        return null;
      },
      204,
    );
  }),
];
