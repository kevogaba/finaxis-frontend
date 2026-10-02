import { describe, expect, it } from 'vitest';
import type { ActionResult } from '@/lib/api/action-result';
import type { TenantSetting } from './settings-contract';
import {
  SETTING_GROUPS,
  otherSettings,
  settingActions,
  settingOptions,
  settingValueLabel,
  withSettingProblem,
} from './settings-rules';

function setting(
  key: string,
  value: string | null,
  extra: Partial<TenantSetting> = {},
): TenantSetting {
  return { key, value, redacted: false, platformAdminOnly: false, ...extra };
}

describe('settings rules', () => {
  it('groups exactly the six catalogue keys (contract §H); anything else is an extra', () => {
    expect(
      SETTING_GROUPS.flatMap((group) => group.entries.map((entry) => entry.key)).sort(),
    ).toEqual([
      'audit_retention_days',
      'base_currency',
      'business_date_auto_advance_enabled',
      'default_timezone',
      'require_maker_checker_for_branch_creation',
      'require_maker_checker_for_user_invites',
    ]);
    expect(
      otherSettings([setting('default_timezone', 'UTC'), setting('settings.operational', 'x')]).map(
        (candidate) => candidate.key,
      ),
    ).toEqual(['settings.operational']);
  });

  it.each([
    ['switch', setting('k', 'true'), 'On'],
    ['switch', setting('k', 'false'), 'Off'],
    ['currency', setting('base_currency', 'KES'), 'KES · Kenyan Shilling'],
    ['retention', setting('audit_retention_days', '365'), '365 days'],
    ['retention', setting('audit_retention_days', null, { redacted: true }), 'Hidden'],
    ['timezone', setting('default_timezone', null), 'Not set'],
    ['timezone', undefined, 'Not available'],
    [null, setting('settings.operational', 'raw'), 'raw'],
  ] as const)('labels a %s value', (kind, value, label) => {
    expect(settingValueLabel(kind, value)).toBe(label);
  });

  it('offers edit on the two editable keys with settings.update, and reset only for a stored value', () => {
    expect(settingActions(setting('default_timezone', 'Africa/Nairobi'), true)).toEqual({
      settingKey: 'default_timezone',
      value: 'Africa/Nairobi',
      reset: true,
    });
    expect(settingActions(setting('base_currency', null), true)).toEqual({
      settingKey: 'base_currency',
      value: null,
      reset: false,
    });
    expect(settingActions(setting('default_timezone', 'Africa/Nairobi'), false)).toBeNull();
    expect(settingActions(undefined, true)).toBeNull();
    [
      setting('business_date_auto_advance_enabled', 'false'),
      setting('audit_retention_days', null, { redacted: true, platformAdminOnly: true }),
      setting('default_timezone', null, { redacted: true }),
      setting('settings.operational', 'x'),
    ].forEach((readOnly) => {
      expect(settingActions(readOnly, true)).toBeNull();
    });
  });

  it('lists the runtime zones and currencies, with a current value it lacks first', () => {
    const zones = settingOptions('default_timezone', 'Legacy/Zone');
    expect(zones[0]).toEqual({ value: 'Legacy/Zone', label: 'Legacy/Zone' });
    expect(zones.some((option) => option.value === 'Africa/Nairobi')).toBe(true);
    expect(settingOptions('base_currency', 'KES').find((option) => option.value === 'KES')).toEqual(
      { value: 'KES', label: 'KES · Kenyan Shilling' },
    );
  });

  it('explains the currency freeze on the form and a bad value on the field', () => {
    const failure = (code: string): ActionResult => ({
      ok: false,
      formError: 'Generic',
      fieldErrors: {},
      code,
      requestId: 'req-1',
    });

    expect(withSettingProblem(failure('accounting.functional_currency_frozen'))).toMatchObject({
      formError: expect.stringContaining('already posted journals'),
      fieldErrors: {},
      code: 'accounting.functional_currency_frozen',
      requestId: 'req-1',
    });
    expect(withSettingProblem(failure('accounting.currency_invalid'))).toMatchObject({
      fieldErrors: { value: expect.stringContaining("can't be used for settlement") },
      requestId: 'req-1',
    });
    expect(withSettingProblem(failure('conflict'))).toEqual(failure('conflict'));
    expect(withSettingProblem({ ok: true })).toEqual({ ok: true });
  });

  it('never puts the value-specific invalid_operation message on a reset (C2: reset sends no value)', () => {
    const failure = (code: string): ActionResult => ({
      ok: false,
      formError: 'Generic',
      fieldErrors: {},
      code,
      requestId: 'req-1',
    });

    expect(withSettingProblem(failure('invalid_operation'), 'update')).toMatchObject({
      fieldErrors: { value: expect.stringContaining("isn't valid for this setting") },
    });
    expect(withSettingProblem(failure('invalid_operation'), 'reset')).toEqual(
      failure('invalid_operation'),
    );
    // The currency freeze isn't value-specific, so it still explains a refused reset.
    expect(
      withSettingProblem(failure('accounting.functional_currency_frozen'), 'reset'),
    ).toMatchObject({ formError: expect.stringContaining('already posted journals') });
  });
});
