import { canAllTenantWide, type PermissionHolder } from '@/auth/permissions';
import { withViews } from '@/auth/permission-views';
import type { TenantSetting } from './settings-contract';

/** The platform's groups (TenantSettingCatalog), in page order; the list itself is sorted by key. */
export const SETTING_GROUP_ORDER = ['General', 'Approvals', 'Business date', 'Audit'] as const;

/** The only keys this page changes: base_currency mirrors the organisation's currency and the
 * retention period is the platform's (both refused here with 422 or 403). */
export const EDITABLE_KEYS = [
  'default_timezone',
  'require_maker_checker_for_user_invites',
  'require_maker_checker_for_branch_creation',
  'business_date_auto_advance_enabled',
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

export const AUTO_ADVANCE_KEY = 'business_date_auto_advance_enabled';
export const MAKER_CHECKER_KEYS: readonly string[] = [
  'require_maker_checker_for_user_invites',
  'require_maker_checker_for_branch_creation',
];

export const BASE_CURRENCY_NOTE = "Set from the institution's currency. It can't be changed here.";
export const RETENTION_NOTE = 'Managed by the platform';
/** Storing `true` also needs `business_date.advance` (TenantSettingsService, #277). */
export const AUTO_ADVANCE_NEEDS_PERMISSION =
  'Turning on automatic advance needs permission to advance the business date.';
export const INVALID_VALUE = "This value isn't valid for this setting.";

export function isEditableKey(key: string): key is EditableKey {
  return EDITABLE_KEYS.some((editable) => editable === key);
}

export interface SettingGroup {
  group: string;
  settings: TenantSetting[];
}

/** The catalogue keys under their groups, in `SETTING_GROUP_ORDER` (a group the platform adds later
 * goes last). Keys outside the catalogue (`group` null) are left for "Other stored settings". */
export function groupSettings(settings: readonly TenantSetting[]): SettingGroup[] {
  const groups = new Map<string, TenantSetting[]>();
  for (const setting of settings) {
    if (setting.group !== null) {
      groups.set(setting.group, [...(groups.get(setting.group) ?? []), setting]);
    }
  }
  const rank = (group: string) => {
    const index = SETTING_GROUP_ORDER.findIndex((known) => known === group);
    return index === -1 ? SETTING_GROUP_ORDER.length : index;
  };
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([group, entries]) => ({ group, settings: entries }));
}

/** Under the label: the read-only keys' own note, otherwise the platform's description. */
export function settingNote(setting: TenantSetting): string | null {
  if (setting.key === 'base_currency') return BASE_CURRENCY_NOTE;
  if (setting.key === 'audit_retention_days') return RETENTION_NOTE;
  return setting.description;
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

/** A value line (the switches render their own On/Off). */
export function settingValueLabel(setting: TenantSetting): string {
  if (setting.redacted) return 'Hidden';
  const { value } = setting;
  if (value === null) return 'Not set';
  if (setting.valueType === 'CURRENCY') return currencyLabel(value);
  if (setting.key === 'audit_retention_days') return `${value} days`;
  return value;
}

export interface AllowedSettingActions {
  /** Edit the time zone, or flip a switch. */
  edit: boolean;
  /** Only while a value is stored (`is_default` false). */
  reset: boolean;
  /** Why the switch can't be turned on here, shown beside it. */
  blocked: string | null;
}

/** TenantSettingsService checks `settings.update`, and the `settings.view` it implies, tenant-wide
 * (ADR 0030, BG-33). */
export function canUpdateSettings(holder: PermissionHolder): boolean {
  return canAllTenantWide(holder, withViews(['settings.update']));
}

/** The platform checks `settings.update` (and its view) tenant-wide, on an editable key only. */
export function settingActions(
  setting: TenantSetting,
  holder: PermissionHolder,
): AllowedSettingActions {
  const edit = isEditableKey(setting.key) && canUpdateSettings(holder);
  const blocked =
    edit &&
    setting.key === AUTO_ADVANCE_KEY &&
    setting.value !== 'true' &&
    !canAllTenantWide(holder, withViews(['business_date.advance']))
      ? AUTO_ADVANCE_NEEDS_PERMISSION
      : null;
  return { edit, reset: edit && !setting.isDefault, blocked };
}

/** The confirmation a switch shows before it changes. */
export interface SwitchChange {
  title: string;
  description: string;
  confirmLabel: string;
  reason: 'optional' | 'required';
  /** The toast once it changed. */
  done: string;
}

const HIGH_SEVERITY =
  "Each such approval is recorded as a high-severity event. The platform's own checks still apply.";

const SWITCHES: Record<string, { name: string; on: string; off: string }> = {
  require_maker_checker_for_user_invites: {
    name: 'maker-checker for user invitations',
    on: "The person who invites someone won't be able to approve them, and the invited person won't be able to approve their own membership.",
    off: `The person who invites someone will be able to approve them, and the invited person will be able to approve their own membership. ${HIGH_SEVERITY}`,
  },
  require_maker_checker_for_branch_creation: {
    name: 'maker-checker for branch creation',
    on: "The person who drafts or edits a branch won't be able to activate it.",
    off: `The person who drafts or edits a branch will be able to activate it. ${HIGH_SEVERITY}`,
  },
  [AUTO_ADVANCE_KEY]: {
    name: 'automatic business date advance',
    on: "The platform will advance an open business date one day at a time until it reaches today in the institution's time zone, once the platform operator has switched scheduled advances on.",
    off: 'The business date will advance only when someone advances it.',
  },
};

/** Turning a maker-checker switch off relaxes a control, so it needs a reason (spec §8, 07). */
export function switchChange(key: string, on: boolean): SwitchChange | null {
  const copy = SWITCHES[key];
  if (!copy) return null;
  const direction = on ? 'on' : 'off';
  return {
    title: `Turn ${direction} ${copy.name}?`,
    description: on ? copy.on : copy.off,
    confirmLabel: `Turn ${direction}`,
    reason: !on && MAKER_CHECKER_KEYS.includes(key) ? 'required' : 'optional',
    done: `${copy.name.charAt(0).toUpperCase()}${copy.name.slice(1)} turned ${direction}`,
  };
}
