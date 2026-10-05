import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { MAKER_NOT_PERMITTED, MAKER_NOT_RECORDED, READ_FAILED } from '../approval-copy';
import { MakerValue, ReadFailed } from './request-facts';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const FAILED = {
  title: 'Something went wrong',
  message: 'Try again.',
  code: null,
  requestId: 'req-1',
};
const event = (actorUserId: string | null) => ({
  ok: true as const,
  value: { actorUserId, occurredAt: '2026-09-24T08:00:00Z' },
});

describe('MakerValue', () => {
  it.each([
    ['not permitted (nothing read)', null, null, MAKER_NOT_PERMITTED],
    ['an event with no actor', event(null), null, MAKER_NOT_RECORDED],
    ['no event at all', { ok: true as const, value: null }, null, MAKER_NOT_RECORDED],
    ['someone else, by name', event(VICTOR), 'Victor Kamau', 'Victor Kamau'],
    ['someone the lookup can’t name, by short id', event(VICTOR), null, 'b2000000'],
    ['the signed-in user, in any case', event(ME.toUpperCase()), 'Ann Admin', 'Ann Admin (you)'],
  ])('says %s', (_case, maker, name, text) => {
    renderWithProviders(
      <p data-testid="value">
        <MakerValue maker={maker} name={name} me={ME} />
      </p>,
    );
    expect(screen.getByTestId('value').textContent).toBe(text);
  });

  it('says a failed read failed, with its reference, never as "not recorded"', () => {
    renderWithProviders(
      <p data-testid="value">
        <MakerValue maker={{ ok: false, problem: FAILED }} name={null} me={ME} />
      </p>,
    );
    const value = screen.getByTestId('value');
    expect(value).toHaveTextContent(READ_FAILED);
    expect(value).toHaveTextContent('Reference: req-1');
    expect(value).not.toHaveTextContent(MAKER_NOT_RECORDED);
  });

  it('leaves the reference out when the failure has none', () => {
    renderWithProviders(
      <p data-testid="value">
        <ReadFailed problem={{ ...FAILED, requestId: null }} />
      </p>,
    );
    expect(screen.getByTestId('value').textContent).toBe(READ_FAILED);
  });
});
