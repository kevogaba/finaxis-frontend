import { describe, expect, it } from 'vitest';
import { businessDateDay, isoToBusinessDate, nextBusinessDateIso } from './business-date';

describe('business dates', () => {
  it('accepts only strict dd-MM-yyyy calendar dates', () => {
    expect(businessDateDay('07-09-2026')).not.toBeNull();
    ['7-9-2026', '2026-09-07', '31-02-2026', '00-01-2026', '07/09/2026', ''].forEach((bad) => {
      expect(businessDateDay(bad)).toBeNull();
    });
  });

  it('orders by calendar, not by string', () => {
    // As strings '01-10-2026' < '30-09-2026', but 1 October is later.
    expect((businessDateDay('01-10-2026') ?? 0) > (businessDateDay('30-09-2026') ?? 0)).toBe(true);
  });

  it('converts date-input values and finds the next allowed date across month and year ends', () => {
    expect(isoToBusinessDate('2026-09-08')).toBe('08-09-2026');
    expect(isoToBusinessDate('2026-02-30')).toBeNull();
    expect(isoToBusinessDate('08-09-2026')).toBeNull();
    expect(nextBusinessDateIso('30-09-2026')).toBe('2026-10-01');
    expect(nextBusinessDateIso('31-12-2026')).toBe('2027-01-01');
  });
});
