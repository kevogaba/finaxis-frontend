import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { TenantSummary } from '../../tenants/tenant-contract';
import {
  ATTENTION_DESCRIPTION,
  DRAFTS_HREF,
  PENDING_HREF,
  type AttentionView,
} from '../overview-rules';
import { AttentionCard } from './attention-card';

// Lettered tails, so the lower-cased id in a link differs from the upper-cased one.
const MWANGAZA: TenantSummary = {
  id: '16000000-0000-4000-8000-0000000000A3',
  tenantCode: 'mwangaza-savings',
  displayName: 'Mwangaza Savings SACCO',
  countryCode: 'KE',
  status: 'PENDING_APPROVAL',
  // 23:30 UTC: a viewer east of Greenwich would read 04 Sep, so this proves the column is UTC.
  createdAt: '2026-09-03T23:30:00Z',
};
const UMOJA: TenantSummary = {
  id: '16000000-0000-4000-8000-0000000000A1',
  tenantCode: 'umoja-teachers',
  displayName: 'Umoja Teachers SACCO',
  countryCode: 'UG',
  status: 'DRAFT',
  createdAt: '2026-09-05T08:00:00Z',
};

const view = (overrides: Partial<AttentionView> = {}): AttentionView => ({
  rows: [MWANGAZA, UMOJA],
  failures: [],
  more: [],
  empty: null,
  ...overrides,
});

describe('AttentionCard', () => {
  it('lists the rows in order with links, words and UTC dates', () => {
    renderWithProviders(<AttentionCard view={view()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText(ATTENTION_DESCRIPTION)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Institutions needing attention' });
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Institution',
      'Lifecycle',
      'Country',
      'Created (UTC)',
    ]);
    // The header row and the two institutions, pending approval first.
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const mwangaza = within(table).getByRole('row', { name: /Mwangaza Savings SACCO/ });
    const umoja = within(table).getByRole('row', { name: /Umoja Teachers SACCO/ });
    expect(rows.indexOf(mwangaza)).toBe(1);
    expect(rows.indexOf(umoja)).toBe(2);
    expect(within(mwangaza).getByRole('link', { name: 'Mwangaza Savings SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/16000000-0000-4000-8000-0000000000a3',
    );
    const cells = within(mwangaza).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('Pending approval');
    expect(cells[2]).toHaveTextContent('KE · Kenya');
    expect(cells[3]).toHaveTextContent('03 Sep 2026');
    expect(within(umoja).getByRole('link', { name: 'Umoja Teachers SACCO' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants/16000000-0000-4000-8000-0000000000a1',
    );
    const umojaCells = within(umoja).getAllByRole('cell');
    expect(umojaCells[1]).toHaveTextContent('Draft');
    expect(umojaCells[2]).toHaveTextContent('UG · Uganda');

    // The scroll container is a named, keyboard-focusable region, so a 375 px screen reaches the
    // whole table; the card's section is the region "Needs attention", so the two names differ.
    const region = screen.getByRole('region', { name: 'Needs attention table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table', { name: 'Institutions needing attention' })).toBe(
      table,
    );
    // Two landmarks, two names (axe rates landmark-unique moderate, so only this count catches a
    // clash): the section and the scroll container.
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: 'Needs attention' })).toHaveLength(1);
  });

  it('shows each failure as its own error with the rows that did load', () => {
    renderWithProviders(
      <AttentionCard
        view={view({
          rows: [MWANGAZA],
          failures: [
            "Drafts couldn't be loaded. Reference: req-d",
            "Institutions pending approval couldn't be loaded. Reference: req-p",
          ],
        })}
      />,
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Drafts couldn't be loaded. Reference: req-d",
      "Institutions pending approval couldn't be loaded. Reference: req-p",
    ]);
    // The half that loaded is still listed, and nothing says that nothing needs attention.
    expect(screen.getByRole('link', { name: 'Mwangaza Savings SACCO' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs attention')).toBeNull();
  });

  it('shows the View all links', () => {
    renderWithProviders(
      <AttentionCard
        view={view({
          more: [
            { href: PENDING_HREF, label: 'View all 7 institutions pending approval' },
            { href: DRAFTS_HREF, label: 'View all 3 drafts' },
          ],
        })}
      />,
    );

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(list).getByRole('link', { name: 'View all 7 institutions pending approval' }),
    ).toHaveAttribute('href', PENDING_HREF);
    expect(within(list).getByRole('link', { name: 'View all 3 drafts' })).toHaveAttribute(
      'href',
      DRAFTS_HREF,
    );
  });

  it('shows no View all list when the preview holds everything', () => {
    renderWithProviders(<AttentionCard view={view()} />);

    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows the empty state only when given one', () => {
    const { unmount } = renderWithProviders(
      <AttentionCard view={view({ rows: [], failures: ["Drafts couldn't be loaded."] })} />,
    );

    // A failed half with nothing known to say: no table, and no claim that nothing is waiting.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Needs attention table' })).toBeNull();
    expect(screen.queryByText('Nothing needs attention')).toBeNull();
    unmount();

    renderWithProviders(
      <AttentionCard
        view={view({
          rows: [],
          empty: {
            title: 'Nothing needs attention',
            description: 'No institution is waiting for approval, and there are no drafts.',
          },
        })}
      />,
    );
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
    expect(
      screen.getByText('No institution is waiting for approval, and there are no drafts.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
