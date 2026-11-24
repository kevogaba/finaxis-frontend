import { describe, expect, it } from 'vitest';
import type { PermissionHolder } from '@/auth/permissions';
import type { TenantSetting } from './settings-contract';
import {
  AUTO_ADVANCE_NEEDS_PERMISSION,
  BASE_CURRENCY_NOTE,
  canUpdateSettings,
  EDITABLE_KEYS,
  RETENTION_NOTE,
  groupSettings,
  settingActions,
  settingNote,
  settingValueLabel,
  switchChange,
} from './settings-rules';

function setting(key: string, overrides: Partial<TenantSetting> = {}): TenantSetting {
  return {
    key,
    value: null,
    redacted: false,
    valueType: 'STRING',
    isDefault: true,
    label: key,
    description: `About ${key}`,
    group: 'General',
    ...overrides,
  };
}

const tenantWide = (...codes: string[]): PermissionHolder => ({
  permissions: codes,
  tenantPermissions: codes,
});
const ADMIN = tenantWide(
  'settings.view',
  'settings.update',
  'business_date.view',
  'business_date.advance',
);
const NONE = { edit: false, reset: false, blocked: null };

describe('settings rules', () => {
  // TenantSettingsService checks settings.update and settings.view tenant-wide (BG-33).
  it('updates only with settings.update and settings.view tenant-wide', () => {
    const codes = ['settings.view', 'settings.update'];
    expect(canUpdateSettings({ permissions: codes, tenantPermissions: codes })).toBe(true);
    expect(canUpdateSettings({ permissions: codes, tenantPermissions: ['settings.update'] })).toBe(
      false,
    );
    expect(canUpdateSettings({ permissions: codes, tenantPermissions: ['settings.view'] })).toBe(
      false,
    );
  });

  it("files the key-sorted list under the platform's groups in page order, leaving extras out", () => {
    const groups = groupSettings([
      setting('audit_retention_days', { group: 'Audit' }),
      setting('base_currency'),
      setting('business_date_auto_advance_enabled', { group: 'Business date' }),
      setting('default_timezone'),
      setting('legacy.operational_profile', { group: null, label: null, description: null }),
      setting('new_key', { group: 'Security' }),
      setting('require_maker_checker_for_branch_creation', { group: 'Approvals' }),
      setting('require_maker_checker_for_user_invites', { group: 'Approvals' }),
    ]);

    expect(
      groups.map(({ group, settings }) => [group, settings.map((entry) => entry.key)]),
    ).toEqual([
      ['General', ['base_currency', 'default_timezone']],
      [
        'Approvals',
        ['require_maker_checker_for_branch_creation', 'require_maker_checker_for_user_invites'],
      ],
      ['Business date', ['business_date_auto_advance_enabled']],
      ['Audit', ['audit_retention_days']],
      // A group the platform adds later still shows, after the known ones.
      ['Security', ['new_key']],
    ]);
  });

  it('changes the time zone and the three switches, and nothing else', () => {
    expect(EDITABLE_KEYS).toEqual([
      'default_timezone',
      'require_maker_checker_for_user_invites',
      'require_maker_checker_for_branch_creation',
      'business_date_auto_advance_enabled',
    ]);
  });

  it.each(EDITABLE_KEYS)('offers Edit on %s, and Reset only once a value is stored', (key) => {
    expect(settingActions(setting(key, { value: 'true', isDefault: false }), ADMIN)).toEqual({
      edit: true,
      reset: true,
      blocked: null,
    });
    expect(settingActions(setting(key, { value: 'true', isDefault: true }), ADMIN)).toEqual({
      edit: true,
      reset: false,
      blocked: null,
    });
  });

  it('offers nothing on base currency, retention or a stored extra, whatever is_default says', () => {
    // base_currency always reads is_default: false (it mirrors the organisation's column).
    expect(
      settingActions(setting('base_currency', { value: 'KES', isDefault: false }), ADMIN),
    ).toEqual(NONE);
    expect(
      settingActions(setting('audit_retention_days', { redacted: true, isDefault: false }), ADMIN),
    ).toEqual(NONE);
    expect(
      settingActions(
        setting('legacy.operational_profile', { group: null, isDefault: false }),
        ADMIN,
      ),
    ).toEqual(NONE);
  });

  it('needs settings.update and its view tenant-wide (the platform checks the tenant)', () => {
    const stored = setting('default_timezone', { value: 'Africa/Nairobi', isDefault: false });
    expect(
      settingActions(stored, {
        permissions: ['settings.view', 'settings.update'],
        tenantPermissions: ['settings.view'],
      }),
    ).toEqual(NONE);
    expect(settingActions(stored, tenantWide('settings.update'))).toEqual(NONE);
    expect(settingActions(stored, tenantWide('settings.view', 'settings.update')).edit).toBe(true);
  });

  it('blocks turning automatic advance on without business_date.advance, never turning it off', () => {
    const editor = tenantWide('settings.view', 'settings.update');
    const off = setting('business_date_auto_advance_enabled', { value: 'false' });
    expect(settingActions(off, editor)).toEqual({
      edit: true,
      reset: false,
      blocked: AUTO_ADVANCE_NEEDS_PERMISSION,
    });
    expect(AUTO_ADVANCE_NEEDS_PERMISSION).toBe(
      'Turning on automatic advance needs permission to advance the business date.',
    );
    expect(
      settingActions(setting(off.key, { value: 'true', isDefault: false }), editor).blocked,
    ).toBeNull();
    // Held only at branch scope, the platform still refuses it.
    expect(
      settingActions(off, {
        permissions: [
          'settings.view',
          'settings.update',
          'business_date.view',
          'business_date.advance',
        ],
        tenantPermissions: ['settings.view', 'settings.update'],
      }).blocked,
    ).toBe(AUTO_ADVANCE_NEEDS_PERMISSION);
  });

  it.each([
    [setting('k', { value: 'raw' }), 'raw'],
    [setting('base_currency', { value: 'KES', valueType: 'CURRENCY' }), 'KES · Kenyan Shilling'],
    [setting('audit_retention_days', { value: '2555', valueType: 'INT' }), '2555 days'],
    [setting('audit_retention_days', { redacted: true, valueType: 'INT' }), 'Hidden'],
    [setting('default_timezone'), 'Not set'],
  ])('labels %j', (value, label) => {
    expect(settingValueLabel(value)).toBe(label);
  });

  it("puts the read-only keys' own notes under their labels, and the platform's description elsewhere", () => {
    expect(settingNote(setting('base_currency'))).toBe(BASE_CURRENCY_NOTE);
    expect(BASE_CURRENCY_NOTE).toBe(
      "Set from the institution's currency. It can't be changed here.",
    );
    expect(settingNote(setting('audit_retention_days'))).toBe(RETENTION_NOTE);
    expect(RETENTION_NOTE).toBe('Managed by the platform');
    expect(settingNote(setting('default_timezone'))).toBe('About default_timezone');
  });

  it('asks for a reason, and says what it relaxes, before a maker-checker switch goes off', () => {
    expect(switchChange('require_maker_checker_for_user_invites', false)).toEqual({
      title: 'Turn off maker-checker for user invitations?',
      description:
        "The person who invites someone will be able to approve them, and the invited person will be able to approve their own membership. Each such approval is recorded as a high-severity event. The platform's own checks still apply.",
      confirmLabel: 'Turn off',
      reason: 'required',
      done: 'Maker-checker for user invitations turned off',
    });
    expect(switchChange('require_maker_checker_for_branch_creation', false)).toMatchObject({
      title: 'Turn off maker-checker for branch creation?',
      description:
        "The person who drafts or edits a branch will be able to activate it. Each such approval is recorded as a high-severity event. The platform's own checks still apply.",
      reason: 'required',
    });
  });

  it('keeps the reason optional for turning a switch on and for automatic advance', () => {
    expect(switchChange('require_maker_checker_for_user_invites', true)).toMatchObject({
      title: 'Turn on maker-checker for user invitations?',
      confirmLabel: 'Turn on',
      reason: 'optional',
      done: 'Maker-checker for user invitations turned on',
    });
    expect(switchChange('business_date_auto_advance_enabled', true)).toMatchObject({
      title: 'Turn on automatic business date advance?',
      reason: 'optional',
    });
    expect(switchChange('business_date_auto_advance_enabled', false)).toMatchObject({
      title: 'Turn off automatic business date advance?',
      reason: 'optional',
    });
  });
});
