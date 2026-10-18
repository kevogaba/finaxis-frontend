import { describe, expect, it } from 'vitest';
import { noOverviewCards, overviewCards } from './overview-rules';

describe('which cards a holder sees (Ruling 2)', () => {
  const ALL = [
    'business_date.view',
    'user.approve',
    'user.view',
    'branch.activate',
    'branch.view',
    'settings.view',
    'membership.view',
    'audit.view',
    'tenant.view',
  ];

  it('shows every card to a holder of every code', () => {
    const cards = overviewCards({ permissions: ALL });
    expect(cards).toEqual({
      businessDate: true,
      approvals: { users: true, branches: true },
      readiness: true,
      activity: { names: true, timeZone: true },
    });
    expect(noOverviewCards(cards)).toBe(false);
  });

  it('reads the actors and the timezone only with their own codes (rule 5)', () => {
    expect(overviewCards({ permissions: ['audit.view'] }).activity).toEqual({
      names: false,
      timeZone: false,
    });
    expect(overviewCards({ permissions: ['audit.view', 'user.view'] }).activity).toEqual({
      names: true,
      timeZone: false,
    });
  });

  it('offers each kind of request only with both of its codes', () => {
    expect(overviewCards({ permissions: ['user.approve', 'branch.view'] }).approvals).toBeNull();
    expect(
      overviewCards({ permissions: ['branch.activate', 'branch.view', 'user.view'] }).approvals,
    ).toEqual({ users: false, branches: true });
  });

  it('keeps Readiness while any one item can be checked, and omits the rest', () => {
    expect(overviewCards({ permissions: ['membership.view'] })).toEqual({
      businessDate: false,
      approvals: null,
      readiness: true,
      activity: null,
    });
    expect(overviewCards({ permissions: ['iam.profile.read'] }).readiness).toBe(false);
  });

  it('knows when no card applies, so the page can say so once', () => {
    expect(noOverviewCards(overviewCards({ permissions: ['iam.profile.read'] }))).toBe(true);
    for (const code of ['business_date.view', 'settings.view', 'audit.view']) {
      expect(noOverviewCards(overviewCards({ permissions: [code] })), code).toBe(false);
    }
    expect(
      noOverviewCards(overviewCards({ permissions: ['branch.activate', 'branch.view'] })),
    ).toBe(false);
  });
});
