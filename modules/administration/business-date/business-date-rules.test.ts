import { describe, expect, it } from 'vitest';
import { availableBusinessDateActions, historyEventLabel } from './business-date-rules';

const ALL = [
  'business_date.view',
  'business_date.advance',
  'business_date.reopen',
  'cob.start',
  'cob.complete',
];

describe('business date rules', () => {
  it.each([
    ['OPEN', ['cob.start', 'business_date.advance']],
    ['CLOSING', ['cob.complete']],
    ['CLOSED', ['business_date.reopen']],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBusinessDateActions(status, { permissions: ALL })).toEqual(expected);
  });

  it('needs each action permission and business_date.view (BG-31)', () => {
    expect(
      availableBusinessDateActions('OPEN', { permissions: ['business_date.view', 'cob.start'] }),
    ).toEqual(['cob.start']);
    expect(
      availableBusinessDateActions('OPEN', { permissions: ['cob.start', 'business_date.advance'] }),
    ).toEqual([]);
  });

  it('labels history events, falling back readably', () => {
    expect(historyEventLabel('COB_STARTED')).toBe('Close of business started');
    expect(historyEventLabel('SOMETHING_NEW')).toBe('Something new');
  });
});
