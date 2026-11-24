import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const apiGet = vi.fn();
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

const { listSettings } = await import('./settings-service');

/** Parses `raw` with whatever schema the call site passes, so a schema miss rejects like the real `apiGet`. */
const wire =
  (raw: unknown) =>
  (_path: string, schema: z.ZodType): Promise<unknown> =>
    Promise.resolve().then(() => schema.parse(raw));

describe('settings service', () => {
  it('reads settings at the exact bounded path and maps items and page metadata to camelCase', async () => {
    apiGet.mockImplementationOnce(
      wire({
        items: [
          {
            key: 'default_timezone',
            value: 'Africa/Nairobi',
            value_type: 'TIMEZONE',
            sensitive: false,
            platform_admin_only: false,
            is_default: false,
            label: 'Default time zone',
            description: 'The time zone a new branch takes when it is created without one.',
            group: 'General',
          },
          {
            key: 'audit_retention_days',
            value: '***REDACTED***',
            value_type: 'INT',
            sensitive: false,
            platform_admin_only: true,
            is_default: false,
            label: 'Audit retention (days)',
            description: 'How many days audit events are kept.',
            group: 'Audit',
          },
        ],
        page: {
          number: 0,
          size: 100,
          total_items: 2,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }),
    );

    const result = await listSettings();

    expect(apiGet).toHaveBeenCalledWith('/api/v1/tenant/settings?size=100', expect.anything());
    expect(result.items).toEqual([
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
    ]);
    expect(result.page).toMatchObject({ hasNext: false });
  });
});
