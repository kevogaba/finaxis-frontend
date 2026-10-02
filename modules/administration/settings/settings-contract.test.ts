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
    ...overrides,
  };
}

const parse = (...items: unknown[]) => settingsPageSchema.safeParse({ items, page: PAGE });

describe('settings contract', () => {
  it('maps settings and never keeps the redaction mask as a value', () => {
    const result = parse(
      wire(),
      wire({
        key: 'audit_retention_days',
        value: '***REDACTED***',
        value_type: 'INT',
        platform_admin_only: true,
      }),
      wire({ key: 'base_currency', value: null, value_type: 'CURRENCY' }),
    );

    expect(result.success && result.data.items).toEqual([
      {
        key: 'default_timezone',
        value: 'Africa/Nairobi',
        redacted: false,
        platformAdminOnly: false,
      },
      { key: 'audit_retention_days', value: null, redacted: true, platformAdminOnly: true },
      { key: 'base_currency', value: null, redacted: false, platformAdminOnly: false },
    ]);
  });

  it('tolerates any value_type on a stored key, but not a missing field or a wrong type', () => {
    expect(parse(wire({ key: 'settings.operational', value_type: 'JSON' })).success).toBe(true);

    const { sensitive: _sensitive, ...missing } = wire();
    expect(parse(missing).success).toBe(false);
    expect(parse(wire({ value: 30 })).success).toBe(false);
  });
});
