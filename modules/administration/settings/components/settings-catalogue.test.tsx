import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantSetting } from '../settings-contract';

vi.mock('../settings-actions', () => ({ updateSetting: vi.fn(), resetSetting: vi.fn() }));

const { SettingsCatalogue } = await import('./settings-catalogue');

const plain = { redacted: false, platformAdminOnly: false };
const SETTINGS: TenantSetting[] = [
  { key: 'audit_retention_days', value: null, redacted: true, platformAdminOnly: true },
  { key: 'base_currency', value: 'KES', ...plain },
  { key: 'business_date_auto_advance_enabled', value: 'false', ...plain },
  { key: 'default_timezone', value: null, ...plain },
  { key: 'require_maker_checker_for_branch_creation', value: 'false', ...plain },
  { key: 'require_maker_checker_for_user_invites', value: 'true', ...plain },
  { key: 'settings.operational', value: 'x'.repeat(200), ...plain },
];

const BLOCKED = "Editing isn't available yet.";
const row = (name: string) => screen.getByRole('group', { name });

describe('SettingsCatalogue', () => {
  it('groups the catalogue with honest read-only labels and collapses stored extras', () => {
    renderWithProviders(
      <SettingsCatalogue settings={SETTINGS} truncated={false} canUpdate editBlocked={BLOCKED} />,
    );

    expect(screen.getByRole('region', { name: 'Locale & currency' })).toHaveTextContent(BLOCKED);
    expect(row('Base currency')).toHaveTextContent('KES · Kenyan Shilling');
    expect(
      within(row('Base currency')).getByRole('button', { name: 'Reset to default' }),
    ).toBeEnabled();
    expect(row('Default timezone')).toHaveTextContent('Not set');
    expect(
      within(row('Default timezone')).queryByRole('button', { name: 'Reset to default' }),
    ).toBeNull();
    expect(row('Maker-checker for user invites')).toHaveTextContent('Maker-checker always applies');
    // Enforced regardless of the stored value (C1): the row never shows a stored 'On'/'Off' next
    // to a note that says it always applies.
    expect(row('Maker-checker for user invites')).toHaveTextContent('Always on (enforced)');
    expect(row('Maker-checker for branch creation')).toHaveTextContent('Always on (enforced)');
    expect(within(row('Maker-checker for user invites')).queryByRole('button')).toBeNull();
    expect(row('Automatic business date advance')).toHaveTextContent(
      'Automatic advance is not available yet',
    );
    expect(row('Audit retention')).toHaveTextContent('Hidden');
    expect(within(row('Audit retention')).queryByRole('button')).toBeNull();
    expect(screen.queryByText('***REDACTED***')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Other stored settings (1)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other stored settings (1)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('offers no changes without settings.update, and captions a truncated read', () => {
    renderWithProviders(
      <SettingsCatalogue settings={SETTINGS} truncated canUpdate={false} editBlocked={BLOCKED} />,
    );

    expect(screen.queryAllByRole('button', { name: /^(Edit|Reset to default)$/ })).toHaveLength(0);
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(screen.getByText('Showing the first 100 settings.')).toBeInTheDocument();
  });
});
