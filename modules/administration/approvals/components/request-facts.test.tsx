import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { READ_FAILED } from '../approval-copy';
import { makerLabel, ReadFailed } from './request-facts';

// Distinct first blocks, so a short id names its id; lettered, so upper case differs.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';
const FAILED = {
  title: 'Something went wrong',
  message: 'Try again.',
  code: null,
  requestId: 'req-1',
};

describe('makerLabel (BG-08)', () => {
  it.each([
    ['nobody the record names (the system, or hidden)', null, '—'],
    ['someone else, by name', { id: VICTOR, displayName: 'Victor Kamau' }, 'Victor Kamau'],
    ['someone without a display name, by short id', { id: VICTOR, displayName: null }, 'b2000000'],
    [
      'the signed-in user, in any case',
      { id: ME.toUpperCase(), displayName: 'Ann Admin' },
      'You (Ann Admin)',
    ],
  ])('says %s', (_case, maker, text) => {
    expect(makerLabel(maker, ME)).toBe(text);
  });

  it('says the signed-in user when their own id is the upper-case one', () => {
    expect(makerLabel({ id: ME, displayName: 'Ann Admin' }, ME.toUpperCase())).toBe(
      'You (Ann Admin)',
    );
  });
});

describe('ReadFailed', () => {
  it('says a read failed, with its reference', () => {
    renderWithProviders(
      <p data-testid="value">
        <ReadFailed problem={FAILED} />
      </p>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent(READ_FAILED);
    expect(screen.getByTestId('value')).toHaveTextContent('Reference: req-1');
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
