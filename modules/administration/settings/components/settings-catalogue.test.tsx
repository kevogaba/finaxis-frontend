import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { PermissionHolder } from '@/auth/permissions';
import type { TenantSetting } from '../settings-contract';

vi.mock('../settings-actions', () => ({ updateSetting: vi.fn(), resetSetting: vi.fn() }));

const { SettingsCatalogue } = await import('./settings-catalogue');

function setting(
  key: string,
  label: string | null,
  group: string | null,
  overrides: Partial<TenantSetting> = {},
): TenantSetting {
  return {
    key,
    value: null,
    redacted: false,
    valueType: 'STRING',
    isDefault: true,
    label,
    description: label && `What ${label.toLowerCase()} does.`,
    group,
    ...overrides,
  };
}

// The platform's list order: sorted by key, not by group.
const SETTINGS: TenantSetting[] = [
  setting('audit_retention_days', 'Audit retention (days)', 'Audit', {
    redacted: true,
    valueType: 'INT',
  }),
  setting('base_currency', 'Base currency', 'General', {
    value: 'KES',
    valueType: 'CURRENCY',
    isDefault: false,
  }),
  setting(
    'business_date_auto_advance_enabled',
    'Advance the business date automatically',
    'Business date',
    {
      value: 'false',
      valueType: 'BOOLEAN',
    },
  ),
  setting('default_timezone', 'Default time zone', 'General', {
    value: 'Africa/Nairobi',
    valueType: 'TIMEZONE',
    isDefault: false,
  }),
  setting('legacy.operational_profile', null, null, { value: 'x'.repeat(200) }),
  setting(
    'require_maker_checker_for_branch_creation',
    'Require maker-checker for branch creation',
    'Approvals',
    {
      value: 'false',
      valueType: 'BOOLEAN',
      isDefault: false,
    },
  ),
  setting(
    'require_maker_checker_for_user_invites',
    'Require maker-checker for user invitations',
    'Approvals',
    {
      value: 'true',
      valueType: 'BOOLEAN',
    },
  ),
];

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
const row = (name: string) => screen.getByRole('group', { name });
const RESET = { name: 'Reset to default' };

describe('SettingsCatalogue', () => {
  it("files the catalogue under the platform's groups, in page order, with its labels", () => {
    renderWithProviders(<SettingsCatalogue settings={SETTINGS} truncated={false} holder={ADMIN} />);

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['General', 'Approvals', 'Business date', 'Audit', 'Other stored settings (1)']);
    const general = within(screen.getByRole('region', { name: 'General' })).getAllByRole('group');
    expect(general).toHaveLength(2);
    expect(general[0]).toHaveAccessibleName('Base currency');
    expect(general[1]).toHaveAccessibleName('Default time zone');
    expect(row('Default time zone')).toHaveTextContent('What default time zone does.');
    expect(row('Default time zone')).toHaveTextContent('Africa/Nairobi');
    expect(screen.queryByText('***REDACTED***')).toBeNull();
  });

  it('shows base currency and retention read-only, with their notes', () => {
    renderWithProviders(<SettingsCatalogue settings={SETTINGS} truncated={false} holder={ADMIN} />);

    expect(row('Base currency')).toHaveTextContent('KES · Kenyan Shilling');
    expect(row('Base currency')).toHaveTextContent(
      "Set from the institution's currency. It can't be changed here.",
    );
    expect(row('Base currency')).toHaveTextContent('Read-only');
    // is_default is always false here, yet nothing is offered.
    expect(within(row('Base currency')).queryByRole('button')).toBeNull();
    expect(row('Audit retention (days)')).toHaveTextContent('Managed by the platform');
    expect(row('Audit retention (days)')).toHaveTextContent('Hidden');
    expect(within(row('Audit retention (days)')).queryByRole('button')).toBeNull();
  });

  it('renders each switch with its state, and Reset only where a value is stored', () => {
    renderWithProviders(<SettingsCatalogue settings={SETTINGS} truncated={false} holder={ADMIN} />);

    const invites = screen.getByRole('switch', {
      name: 'Require maker-checker for user invitations',
    });
    expect(invites).toBeChecked();
    expect(invites).toBeEnabled();
    expect(row('Require maker-checker for user invitations')).toHaveTextContent('On');
    expect(
      within(row('Require maker-checker for user invitations')).queryByRole('button', RESET),
    ).toBeNull();

    expect(
      screen.getByRole('switch', { name: 'Require maker-checker for branch creation' }),
    ).not.toBeChecked();
    expect(row('Require maker-checker for branch creation')).toHaveTextContent('Off');
    expect(
      within(row('Require maker-checker for branch creation')).getByRole('button', RESET),
    ).toBeEnabled();

    expect(
      screen.getByRole('switch', { name: 'Advance the business date automatically' }),
    ).toBeEnabled();
    expect(within(row('Default time zone')).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(row('Default time zone')).getByRole('button', RESET)).toBeEnabled();
  });

  it('explains why automatic advance cannot be turned on without business_date.advance', () => {
    renderWithProviders(
      <SettingsCatalogue
        settings={SETTINGS}
        truncated={false}
        holder={tenantWide('settings.view', 'settings.update')}
      />,
    );

    const advance = screen.getByRole('switch', { name: 'Advance the business date automatically' });
    expect(advance).toBeDisabled();
    expect(advance).toHaveAccessibleDescription(
      'Turning on automatic advance needs permission to advance the business date.',
    );
    // The maker-checker switches only need settings.update.
    expect(
      screen.getByRole('switch', { name: 'Require maker-checker for user invitations' }),
    ).toBeEnabled();
  });

  it('offers no changes without settings.update held tenant-wide, and captions a truncated read', () => {
    renderWithProviders(
      <SettingsCatalogue
        settings={SETTINGS}
        truncated
        holder={{
          permissions: ['settings.view', 'settings.update'],
          tenantPermissions: ['settings.view'],
        }}
      />,
    );

    expect(screen.queryAllByRole('button', { name: /^(Edit|Reset to default)$/ })).toHaveLength(0);
    screen.getAllByRole('switch').forEach((control) => {
      expect(control).toBeDisabled();
    });
    expect(
      screen.getByRole('switch', { name: 'Advance the business date automatically' }),
    ).not.toHaveAccessibleDescription();
    expect(screen.getByText('Showing the first 100 settings.')).toBeInTheDocument();
  });

  it('collapses stored keys outside the catalogue, read-only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsCatalogue settings={SETTINGS} truncated={false} holder={ADMIN} />);

    const others = screen.getByRole('button', { name: 'Other stored settings (1)' });
    expect(others).toHaveAttribute('aria-expanded', 'false');
    await user.click(others);
    expect(row('legacy.operational_profile')).toHaveTextContent('x'.repeat(200));
    expect(within(row('legacy.operational_profile')).queryByRole('button')).toBeNull();
  });
});
