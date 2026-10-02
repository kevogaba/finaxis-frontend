import { requireContext, requirePermission, requireTenantContext } from '../access.mts';
import type { AccessContext } from '../access.mts';
import { objectBody, pageOf, problem, readBody, sendJson, stringField } from '../http.mts';
import { sendIdempotent } from '../idempotency.mts';
import { route } from '../router.mts';
import type { Route, RouteContext } from '../router.mts';
import type { FakeTenantSetting } from '../state.mts';

const BASE = '/api/v1/tenant/settings';
const MASK = '***REDACTED***';

interface Definition {
  valueType: 'TIMEZONE' | 'CURRENCY' | 'BOOLEAN' | 'INT';
  platformAdminOnly: boolean;
  defaultValue: string | null;
}

/** lifecycle/domain/TenantSettingCatalog.kt (contract §H). A Map, so `toString` is never a key. */
const CATALOGUE = new Map<string, Definition>([
  ['default_timezone', { valueType: 'TIMEZONE', platformAdminOnly: false, defaultValue: null }],
  ['base_currency', { valueType: 'CURRENCY', platformAdminOnly: false, defaultValue: null }],
  [
    'require_maker_checker_for_user_invites',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  [
    'require_maker_checker_for_branch_creation',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  [
    'business_date_auto_advance_enabled',
    { valueType: 'BOOLEAN', platformAdminOnly: false, defaultValue: 'false' },
  ],
  ['audit_retention_days', { valueType: 'INT', platformAdminOnly: true, defaultValue: null }],
]);

function tenantAccess(context: RouteContext): AccessContext {
  const access = requireContext(context);
  requireTenantContext(access);
  return access;
}

function rowsOf(context: RouteContext, access: AccessContext): FakeTenantSetting[] {
  return context.state.tenantSettings.filter(
    (row) => row.organisationId === access.organisation.id,
  );
}

/**
 * TenantSettingsService.view plus list's masking. A tenant context never holds the PLATFORM
 * organisation's `tenant_setting.manage_platform`, so a platform-only value is masked here even
 * when it is unset.
 */
function toWire(key: string, row: FakeTenantSetting | undefined) {
  const definition = CATALOGUE.get(key);
  const raw = row?.value ?? definition?.defaultValue ?? null;
  const sensitive = row?.sensitive ?? false;
  const platformAdminOnly = definition?.platformAdminOnly ?? false;
  return {
    key,
    value: platformAdminOnly || (sensitive && raw !== null) ? MASK : raw,
    value_type: definition?.valueType ?? row?.valueType ?? 'STRING',
    sensitive,
    platform_admin_only: platformAdminOnly,
  };
}

/** The service's order: unknown key → 422, platform-only → 403, then `settings.update`. */
function writable(access: AccessContext, key: string): Definition {
  const definition = CATALOGUE.get(key);
  if (!definition) {
    throw problem(422, 'invalid_operation', 'Unknown tenant setting key.');
  }
  if (definition.platformAdminOnly) {
    throw problem(403, 'forbidden', 'You are not permitted to perform this action.');
  }
  requirePermission(access, 'settings.update');
  return definition;
}

const invalidValue = () =>
  problem(422, 'invalid_operation', 'The value is not valid for this setting.');

/** TenantSettingCatalog.canonicalize. ponytail: INT is platform-only, so it 403s first here. */
function canonical(definition: Definition, raw: string): string {
  const value = raw.trim();
  if (definition.valueType === 'BOOLEAN') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') throw invalidValue();
    return lower;
  }
  if (definition.valueType === 'TIMEZONE') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    } catch {
      throw invalidValue();
    }
    return value;
  }
  if (definition.valueType === 'CURRENCY') {
    const code = value.toUpperCase();
    // ponytail: approximates MoneyPolicy.requireSettlementCurrency (unknown codes and XXX only).
    if (code === 'XXX' || !Intl.supportedValuesOf('currency').includes(code)) {
      throw problem(
        422,
        'accounting.currency_invalid',
        'The currency is not a settlement currency.',
      );
    }
    return code;
  }
  return value;
}

/** TenantSettingsService runs the freeze on createOrUpdate *and* deactivate. */
function requireCurrencyNotFrozen(context: RouteContext, key: string): void {
  if (key === 'base_currency' && context.state.baseCurrencyFrozen) {
    throw problem(
      409,
      'accounting.functional_currency_frozen',
      'The base currency cannot change once the organisation has posted a journal.',
    );
  }
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
        key,
        rows.find((row) => row.key === key),
      ),
    );
    sendJson(context.res, 200, pageOf(items, context.query));
  }),

  // The intended contract (200 TenantSetting). Dev answers 500 while BG-04 stands; the app never
  // calls this then (SETTINGS_EDIT_ENABLED). ponytail: no audit row is written for a settings
  // change (plan Ruling 8) — call recordAuditEvent here when a settings-history view exists.
  route('PUT', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    const body = objectBody(await readBody(context.req), ['value', 'reason']);
    const raw = stringField(body, 'value', { required: true }) ?? '';
    stringField(body, 'reason', { required: false });
    if (raw.trim() === '') {
      throw problem(400, 'validation_failed', 'Validation failed.', [
        { field: 'value', code: 'NotBlank', message: 'must not be blank' },
      ]);
    }
    const definition = writable(access, key);
    const value = canonical(definition, raw);
    sendIdempotent(context, body, () => {
      requireCurrencyNotFrozen(context, key);
      const row = rowsOf(context, access).find((candidate) => candidate.key === key);
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
      return toWire(
        key,
        rowsOf(context, access).find((candidate) => candidate.key === key),
      );
    });
  }),

  route('DELETE', `${BASE}/:key`, async (context) => {
    const access = tenantAccess(context);
    const key = context.params.key ?? '';
    // The body is optional (contract §D); an absent one fingerprints like `{}`.
    const body = objectBody((await readBody(context.req)) ?? {}, ['reason']);
    stringField(body, 'reason', { required: false });
    writable(access, key);
    sendIdempotent(
      context,
      body,
      () => {
        requireCurrencyNotFrozen(context, key);
        // 204 even when nothing was stored (TenantSettingsService.deactivate).
        context.state.tenantSettings = context.state.tenantSettings.filter(
          (row) => row.organisationId !== access.organisation.id || row.key !== key,
        );
        return null;
      },
      204,
    );
  }),
];
