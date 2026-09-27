import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AuditEventTable, type AuditRow } from './audit-event-table';

const ROW: AuditRow = {
  id: 'e1',
  date: '07 Sep 2026',
  time: '10:28',
  actorLabel: 'Grace Nduku',
  actorFilterHref: '/admin/audit?actorId=u1',
  actionLabel: 'Invited user',
  action: 'user.invite',
  reason: 'New teller for Westlands',
  entityLabel: 'User · Mary Wanjiku',
  branchLabel: 'Westlands Branch',
  outcome: 'SUCCESS',
  severity: 'INFO',
  detailHref: '/admin/audit?event=e1',
};

describe('AuditEventTable', () => {
  it('renders dense two-line cells, status labels, and navigable links', () => {
    renderWithProviders(<AuditEventTable rows={[ROW]} timeZone="UTC" />);

    const table = screen.getByRole('table', { name: 'Audit events' });
    expect(
      within(table).getByRole('columnheader', { name: 'Date & time (UTC)' }),
    ).toBeInTheDocument();
    const row = within(table).getAllByRole('row')[1];
    if (!row) throw new Error('row missing');
    expect(within(row).getByText('07 Sep 2026')).toBeInTheDocument();
    expect(within(row).getByText('10:28')).toBeInTheDocument();
    expect(within(row).getByText('user.invite')).toBeInTheDocument();
    expect(within(row).getByText('New teller for Westlands')).toBeInTheDocument();
    expect(within(row).getByText('Success')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /view event/i })).toHaveAttribute(
      'href',
      '/admin/audit?event=e1',
    );
    expect(within(row).getByRole('link', { name: 'Grace Nduku' })).toHaveAttribute(
      'href',
      '/admin/audit?actorId=u1',
    );
  });

  it('keeps very long entity and actor values on one line with the full text available', () => {
    const long = 'x'.repeat(120);
    renderWithProviders(
      <AuditEventTable rows={[{ ...ROW, entityLabel: long, actorLabel: long }]} timeZone="UTC" />,
    );
    // The entity cell (TruncatedText) and the linked actor cell both carry the full value in
    // `title`, matched separately since both hold the same long string.
    expect(screen.getAllByTitle(long)).toHaveLength(2);
  });

  it('truncates a System (unlinked) actor the same way as a linked one', () => {
    const long = 'x'.repeat(120);
    renderWithProviders(
      <AuditEventTable
        rows={[{ ...ROW, actorLabel: long, actorFilterHref: null }]}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });
});
