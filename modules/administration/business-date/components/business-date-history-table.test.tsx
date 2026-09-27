import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { BusinessDateHistoryEntry } from '../business-date-contract';
import { BusinessDateHistoryTable } from './business-date-history-table';

const COMPLETED: BusinessDateHistoryEntry = {
  eventType: 'COB_COMPLETED',
  fromStatus: 'CLOSING',
  toStatus: 'CLOSED',
  fromBusinessDate: '07-09-2026',
  toBusinessDate: '07-09-2026',
  actorUserId: 'u1',
  reason: 'x'.repeat(300),
  occurredAt: '2026-09-07T15:00:00Z',
};

describe('BusinessDateHistoryTable', () => {
  it('shows each change with resolved actors and dense, untruncated-on-demand reasons', () => {
    renderWithProviders(
      <BusinessDateHistoryTable
        entries={[
          COMPLETED,
          {
            ...COMPLETED,
            eventType: 'ADVANCED',
            fromStatus: 'OPEN',
            toStatus: 'OPEN',
            fromBusinessDate: '04-09-2026',
            actorUserId: null,
            reason: null,
          },
        ]}
        actorNames={new Map([['u1', 'Grace Nduku']])}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Occurred (Africa/Nairobi)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Close of business completed')).toBeInTheDocument();
    expect(screen.getByText('Closing → Closed')).toBeInTheDocument();
    expect(screen.getByText('Fri, 4 Sep 2026 → Mon, 7 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Grace Nduku')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByTitle('x'.repeat(300))).toBeInTheDocument();
  });

  it('gives the history region a keyboard-focusable, labelled scroll container', () => {
    renderWithProviders(
      <BusinessDateHistoryTable
        entries={[COMPLETED]}
        actorNames={new Map()}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('region', { name: 'Business date history' })).toHaveAttribute(
      'tabIndex',
      '0',
    );
  });
});
