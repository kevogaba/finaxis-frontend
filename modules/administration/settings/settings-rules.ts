import type { ActionResult } from '@/lib/api/action-result';
import type { TenantSetting } from './settings-contract';

/** How a catalogue value renders (contract §H types). */
export type SettingKind = 'timezone' | 'currency' | 'switch' | 'retention';

export interface SettingEntry {
  key: string;
  label: string;
  /** Under the label: what the setting is, or why it is read-only (spec §10.7, D10). */
  note: string;
  kind: SettingKind;
  /**
   * What the platform actually does, shown instead of the stored value when the two would
   * otherwise contradict each other (e.g. a stored "Off" next to "always applies").
   */
  effective?: string;
}

export interface SettingGroup {
  title: string;
  description: string;
  entries: readonly SettingEntry[];
}

/** The only keys this page changes (D10). Both default to null (contract §H). */
export const EDITABLE_KEYS = ['default_timezone', 'base_currency'] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

export const EDIT_UNAVAILABLE =
  "Editing isn't available yet: the platform can't save setting changes. Reset to default still works.";

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    title: 'Locale & currency',
    description: 'Stored configuration for this institution.',
    entries: [
      {
        key: 'default_timezone',
        label: 'Default timezone',
        note: 'IANA timezone, for example Africa/Nairobi.',
        kind: 'timezone',
      },
      {
        key: 'base_currency',
        label: 'Base currency',
        note: "ISO 4217 code. It can't change once the institution has posted journals.",
        kind: 'currency',
      },
    ],
  },
  {
    title: 'Controls',
    description: 'Shown for reference. The platform applies these rules itself.',
    entries: [
      {
        key: 'require_maker_checker_for_user_invites',
        label: 'Maker-checker for user invites',
        note: 'Maker-checker always applies',
        kind: 'switch',
        effective: 'Always on (enforced)',
      },
      {
        key: 'require_maker_checker_for_branch_creation',
        label: 'Maker-checker for branch creation',
        note: 'Maker-checker always applies',
        kind: 'switch',
        effective: 'Always on (enforced)',
      },
      {
        key: 'business_date_auto_advance_enabled',
        label: 'Automatic business date advance',
        note: 'Automatic advance is not available yet',
        kind: 'switch',
      },
    ],
  },
  {
    title: 'Retention',
    description: 'Set by the platform operator.',
    entries: [
      {
        key: 'audit_retention_days',
        label: 'Audit retention',
        note: 'Managed by the platform',
        kind: 'retention',
      },
    ],
  },
];

const CATALOGUE_KEYS: ReadonlySet<string> = new Set(
  SETTING_GROUPS.flatMap((group) => group.entries.map((entry) => entry.key)),
);

export function isEditableKey(key: string): key is EditableKey {
  return EDITABLE_KEYS.some((editable) => editable === key);
}

/** Stored keys outside the catalogue (contract §H), listed read-only. */
export function otherSettings(settings: readonly TenantSetting[]): TenantSetting[] {
  return settings.filter((setting) => !CATALOGUE_KEYS.has(setting.key));
}

const CURRENCY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });

/** `KES · Kenyan Shilling`; the bare code when the runtime has no name for it. */
export function currencyLabel(code: string): string {
  try {
    const name = CURRENCY_NAMES.of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    // RangeError: not a well-formed ISO 4217 code.
    return code;
  }
}

export function settingValueLabel(
  kind: SettingKind | null,
  setting: TenantSetting | undefined,
): string {
  if (!setting) return 'Not available';
  if (setting.redacted) return 'Hidden';
  const { value } = setting;
  if (value === null) return 'Not set';
  if (kind === 'switch') return value === 'true' ? 'On' : value === 'false' ? 'Off' : value;
  if (kind === 'currency') return currencyLabel(value);
  if (kind === 'retention') return `${value} days`;
  return value;
}

export interface AllowedSettingActions {
  settingKey: EditableKey;
  value: string | null;
  /** Both editable keys default to null, so a value means one is stored (no is_default: BG-12). */
  reset: boolean;
}

/** Editable keys only, with `settings.update`, never on a masked or platform-only value. */
export function settingActions(
  setting: TenantSetting | undefined,
  canUpdate: boolean,
): AllowedSettingActions | null {
  if (!setting || !canUpdate || setting.redacted || setting.platformAdminOnly) return null;
  const { key, value } = setting;
  return isEditableKey(key) ? { settingKey: key, value, reset: value !== null } : null;
}

export interface SettingOption {
  value: string;
  label: string;
}

/**
 * The runtime's IANA zones or ISO 4217 codes. The current value goes first when the list lacks it
 * (an alias such as `UTC`), so the select still shows it.
 */
export function settingOptions(key: EditableKey, current: string | null): SettingOption[] {
  const values = Intl.supportedValuesOf(key === 'default_timezone' ? 'timeZone' : 'currency');
  const all = current !== null && !values.includes(current) ? [current, ...values] : values;
  return all.map((value) => ({
    value,
    label: key === 'base_currency' ? currencyLabel(value) : value,
  }));
}

/**
 * Remedies for the settings codes (contract §I). Kept local because lib/api/problem.ts belongs to
 * 07. `onValue` also puts the message on the Edit dialog's value field.
 */
const SETTING_PROBLEMS = new Map<string, { message: string; onValue: boolean }>([
  // TenantSettingsService runs the freeze on createOrUpdate *and* deactivate, so Reset hits it too.
  [
    'accounting.functional_currency_frozen',
    {
      message: "The base currency can't change: this institution has already posted journals.",
      onValue: false,
    },
  ],
  [
    'accounting.functional_currency_lock_timeout',
    { message: 'Another currency change is in progress. Try again in a moment.', onValue: false },
  ],
  [
    'accounting.currency_invalid',
    { message: "This currency can't be used for settlement. Choose another.", onValue: true },
  ],
  ['invalid_operation', { message: "This value isn't valid for this setting.", onValue: true }],
]);

/**
 * `path`: reset never sends a `value`, so a value-specific code (`onValue`, e.g.
 * `invalid_operation`) has nothing to attach to and is left for `describeProblem`'s generic
 * message instead of the update-only text.
 */
export function withSettingProblem(
  result: ActionResult,
  path: 'update' | 'reset' = 'update',
): ActionResult {
  if (result.ok || result.code === null) return result;
  const known = SETTING_PROBLEMS.get(result.code);
  if (!known || (known.onValue && path === 'reset')) return result;
  return {
    ...result,
    formError: known.message,
    fieldErrors: known.onValue
      ? { ...result.fieldErrors, value: known.message }
      : result.fieldErrors,
  };
}
