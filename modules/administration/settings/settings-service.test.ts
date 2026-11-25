import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

const apiGet = vi.fn();
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
  unstable_rethrow: () => undefined,
}));

const { BackendApiError } = await import('@/auth/backend-api');
const { listSettings, readMakerCheckerSwitch } = await import('./settings-service');

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

describe('readMakerCheckerSwitch (BG-08, decision Q4)', () => {
  const VIEWER = { permissions: ['settings.view'], tenantPermissions: ['settings.view'] };
  const setting = (value: string | null) => ({
    key: 'require_maker_checker_for_user_invites',
    value,
    value_type: 'BOOLEAN',
    sensitive: false,
    platform_admin_only: false,
    is_default: value === null,
    label: 'Require maker-checker for user invitations',
    description: null,
    group: 'Approvals',
  });

  it.each([
    ['"false" is off', 'false', 'off'],
    ['"true" is on', 'true', 'on'],
    // On unless the stored value is the literal "false" (MakerCheckerPolicy).
    ['any other value is on', 'FALSE', 'on'],
    ['an unset value is on', null, 'on'],
  ] as const)('reads the key: %s', async (_case, value, state) => {
    apiGet.mockImplementationOnce(wire(setting(value)));
    await expect(readMakerCheckerSwitch('user_invites', VIEWER)).resolves.toBe(state);
    expect(apiGet).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/require_maker_checker_for_user_invites',
      expect.anything(),
    );
  });

  it('reads the branch switch by its own key', async () => {
    apiGet.mockImplementationOnce(
      wire({ ...setting('false'), key: 'require_maker_checker_for_branch_creation' }),
    );
    await expect(readMakerCheckerSwitch('branch_creation', VIEWER)).resolves.toBe('off');
    expect(apiGet).toHaveBeenLastCalledWith(
      '/api/v1/tenant/settings/require_maker_checker_for_branch_creation',
      expect.anything(),
    );
  });

  it('answers unknown without settings.view tenant-wide, reading nothing', async () => {
    apiGet.mockClear();
    await expect(readMakerCheckerSwitch('user_invites', { permissions: [] })).resolves.toBe(
      'unknown',
    );
    // A branch-scoped grant doesn't count: the platform checks it tenant-wide.
    await expect(
      readMakerCheckerSwitch('user_invites', { permissions: ['settings.view'] }),
    ).resolves.toBe('unknown');
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('answers unknown when the read fails', async () => {
    apiGet.mockRejectedValueOnce(new BackendApiError(503, { requestId: 'req-1' }));
    await expect(readMakerCheckerSwitch('user_invites', VIEWER)).resolves.toBe('unknown');
  });

  it('still sends a lost session to sign in again', async () => {
    apiGet.mockRejectedValueOnce(new BackendApiError(401));
    await expect(readMakerCheckerSwitch('user_invites', VIEWER)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
