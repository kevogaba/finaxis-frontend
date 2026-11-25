import { describe, expect, it } from 'vitest';
import { settingsPageSchema } from './settings-contract';

const PAGE = {
  number: 0,
  size: 100,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

function wire(overrides: Record<string, unknown> = {}) {
  return {
    key: 'default_timezone',
    value: 'Africa/Nairobi',
    value_type: 'TIMEZONE',
    sensitive: false,
    platform_admin_only: false,
    is_default: false,
    label: 'Default time zone',
    description: 'The time zone a new branch takes when it is created without one.',
    group: 'General',
    ...overrides,
  };
}

const parse = (...items: unknown[]) => settingsPageSchema.safeParse({ items, page: PAGE });

describe('settings contract', () => {
  it("maps the catalogue's metadata and never keeps the redaction mask as a value", () => {
    const result = parse(
      wire(),
      wire({
        key: 'audit_retention_days',
        value: '***REDACTED***',
        value_type: 'INT',
        platform_admin_only: true,
        label: 'Audit retention (days)',
        description: 'How many days audit events are kept.',
        group: 'Audit',
      }),
      wire({
        key: 'require_maker_checker_for_user_invites',
        value: 'true',
        value_type: 'BOOLEAN',
        is_default: true,
        label: 'Require maker-checker for user invitations',
        description: 'When on, the person who invited a member cannot approve the membership.',
        group: 'Approvals',
      }),
    );

    expect(result.success && result.data.items).toEqual([
      {
        key: 'default_timezone',
        value: 'Africa/Nairobi',
        redacted: false,
        valueType: 'TIMEZONE',
        isDefault: false,
        label: 'Default time zone',
        description: 'The time zone a new branch takes when it is created without one.',
        group: 'General',
      },
      {
        key: 'audit_retention_days',
        value: null,
        redacted: true,
        valueType: 'INT',
        isDefault: false,
        label: 'Audit retention (days)',
        description: 'How many days audit events are kept.',
        group: 'Audit',
      },
      {
        key: 'require_maker_checker_for_user_invites',
        value: 'true',
        redacted: false,
        valueType: 'BOOLEAN',
        isDefault: true,
        label: 'Require maker-checker for user invitations',
        description: 'When on, the person who invited a member cannot approve the membership.',
        group: 'Approvals',
      },
    ]);
  });

  it('reads a stored key outside the catalogue, whose metadata is null', () => {
    const result = parse(
      wire({
        key: 'legacy.operational_profile',
        value: '{}',
        value_type: 'JSON',
        label: null,
        description: null,
        group: null,
      }),
    );

    expect(result.success && result.data.items[0]).toMatchObject({
      key: 'legacy.operational_profile',
      valueType: 'JSON',
      label: null,
      description: null,
      group: null,
    });
  });

  it('refuses a missing field or a wrong type', () => {
    const { is_default: _isDefault, ...noDefault } = wire();
    expect(parse(noDefault).success).toBe(false);
    const { group: _group, ...noGroup } = wire();
    expect(parse(noGroup).success).toBe(false);
    const { sensitive: _sensitive, ...noSensitive } = wire();
    expect(parse(noSensitive).success).toBe(false);
    expect(parse(wire({ value: 30 })).success).toBe(false);
  });
});
