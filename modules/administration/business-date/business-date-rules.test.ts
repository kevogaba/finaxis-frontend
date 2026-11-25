import { describe, expect, it } from 'vitest';
import { availableBusinessDateActions, historyEventLabel } from './business-date-rules';

const ALL = [
  'business_date.view',
  'business_date.advance',
  'business_date.reopen',
  'cob.start',
  'cob.complete',
];

/** Every code held tenant-wide. */
const wide = (permissions: readonly string[]) => ({ permissions, tenantPermissions: permissions });

describe('business date rules', () => {
  it.each([
    ['OPEN', ['cob.start', 'business_date.advance']],
    ['CLOSING', ['cob.complete']],
    ['CLOSED', ['business_date.reopen']],
  ] as const)('offers the %s transitions', (status, expected) => {
    expect(availableBusinessDateActions(status, wide(ALL))).toEqual(expected);
  });

  it('needs each action permission and business_date.view (BG-31)', () => {
    expect(availableBusinessDateActions('OPEN', wide(['business_date.view', 'cob.start']))).toEqual(
      ['cob.start'],
    );
    expect(
      availableBusinessDateActions('OPEN', wide(['cob.start', 'business_date.advance'])),
    ).toEqual([]);
  });

  // Review Focus 3: BusinessDateService checks each action and business_date.view tenant-wide.
  it('offers nothing held, or whose view is held, only at branch scope', () => {
    const held = (tenantWide: string[]) => ({ permissions: ALL, tenantPermissions: tenantWide });
    expect(availableBusinessDateActions('OPEN', held(['business_date.view', 'cob.start']))).toEqual(
      ['cob.start'],
    );
    expect(
      availableBusinessDateActions('OPEN', held(['cob.start', 'business_date.advance'])),
    ).toEqual([]);
  });

  it('labels history events, falling back readably', () => {
    expect(historyEventLabel('COB_STARTED')).toBe('Close of business started');
    expect(historyEventLabel('SOMETHING_NEW')).toBe('Something new');
  });
});
