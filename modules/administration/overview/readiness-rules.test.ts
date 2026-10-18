import { describe, expect, it } from 'vitest';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';
import {
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
} from '@/modules/administration/approvals/approval-rules';
import {
  branchesItem,
  businessDateItem,
  institutionItem,
  NOT_PERMITTED,
  onboardingItem,
  operationalReadiness,
  peopleItem,
  READINESS_CODES,
  READINESS_LINKS,
  READINESS_STATES,
  type ReadinessReads,
  type SettingFact,
} from './readiness-rules';

const ok = <T>(value: T) => ({ ok: true as const, value });
const failed = (requestId: string | null = '14a00000-0000-4000-8000-0000000000aa') => ({
  ok: false as const,
  problem: { requestId },
});

const setting = (key: string, value: string | null, redacted = false): SettingFact => ({
  key,
  value,
  redacted,
});
const PROFILE_SET = {
  items: [
    setting('default_timezone', 'Africa/Nairobi'),
    setting('base_currency', 'KES'),
    setting('audit_retention_days', null, true),
  ],
};

describe('who can check what (Ruling 3)', () => {
  it('needs one read code per item, and none for the organisation status', () => {
    expect(READINESS_CODES).toEqual({
      institution: 'settings.view',
      branches: 'branch.view',
      people: 'membership.view',
      onboarding: 'user.view',
      businessDate: 'business_date.view',
    });
  });

  it('words every state for its chip', () => {
    expect(READINESS_STATES).toEqual({
      ready: { label: 'Ready', tone: 'success' },
      attention: { label: 'Needs attention', tone: 'warning' },
      unknown: { label: "Can't be checked", tone: 'default' },
      failed: { label: "Couldn't be checked", tone: 'error' },
    });
  });
});

describe('Institution profile', () => {
  it('is ready when the organisation is active and both keys are set', () => {
    expect(institutionItem('ACTIVE', ok(PROFILE_SET))).toEqual({
      id: 'institution',
      label: 'Institution profile',
      state: 'ready',
      detail: 'Active, with a default timezone and a base currency.',
    });
  });

  it.each([
    [[setting('base_currency', 'KES')], "Not set: default timezone. Settings can't be saved yet."],
    [
      [setting('default_timezone', 'Africa/Nairobi')],
      "Not set: base currency. Settings can't be saved yet.",
    ],
    [
      [setting('default_timezone', null), setting('base_currency', null)],
      "Not set: default timezone and base currency. Settings can't be saved yet.",
    ],
  ])(
    'needs attention while a key is unset, and says it cannot be saved yet (%#)',
    (items, detail) => {
      expect(institutionItem('ACTIVE', ok({ items }))).toMatchObject({
        state: 'attention',
        detail,
      });
    },
  );

  it('counts a masked value as set, never as absent', () => {
    const items = [setting('default_timezone', null, true), setting('base_currency', 'KES')];
    expect(institutionItem('ACTIVE', ok({ items })).state).toBe('ready');
  });

  it('names an organisation that is not active, whatever the settings', () => {
    expect(institutionItem('SUSPENDED', null)).toMatchObject({
      state: 'attention',
      detail: 'The institution is suspended.',
    });
  });

  it("can't be checked without the settings read, and says a failed read failed", () => {
    expect(institutionItem('ACTIVE', null)).toMatchObject({
      state: 'unknown',
      detail: NOT_PERMITTED,
    });
    expect(institutionItem('ACTIVE', failed())).toMatchObject({
      state: 'failed',
      detail: "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000aa",
    });
    expect(institutionItem('ACTIVE', failed(null)).detail).toBe("Couldn't be loaded.");
  });
});

describe('Branches', () => {
  it('is ready with an active branch and none waiting', () => {
    expect(branchesItem(ok(1), ok(0))).toMatchObject({
      state: 'ready',
      detail: '1 branch is active, and none is waiting for activation.',
    });
  });

  it.each([
    [0, 0, 'No branch is active yet.'],
    [0, 2, 'No branch is active yet. 2 branches are waiting for activation.'],
    [2, 1, '2 branches are active. 1 branch is waiting for activation.'],
  ])('needs attention with %i active and %i waiting', (active, pending, detail) => {
    expect(branchesItem(ok(active), ok(pending))).toMatchObject({ state: 'attention', detail });
  });

  it("can't be checked without branch.view, and fails with either read", () => {
    expect(branchesItem(null, null).state).toBe('unknown');
    expect(branchesItem(failed('14a00000-0000-4000-8000-0000000000ab'), ok(0)).detail).toBe(
      "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000ab",
    );
    expect(branchesItem(ok(2), failed('14a00000-0000-4000-8000-0000000000ac'))).toMatchObject({
      state: 'failed',
      detail: "Couldn't be loaded. Reference: 14a00000-0000-4000-8000-0000000000ac",
    });
  });
});

describe('People (BG-02)', () => {
  it('is ready with two active members', () => {
    expect(peopleItem(ok(2))).toMatchObject({ state: 'ready', detail: '2 members are active.' });
  });

  it.each([
    [
      1,
      'Only 1 member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).',
    ],
    [
      0,
      'No member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).',
    ],
  ])('needs attention with %i active', (count, detail) => {
    expect(peopleItem(ok(count))).toMatchObject({ state: 'attention', detail });
  });

  it("can't be checked without membership.view, and never reads a failure as zero", () => {
    expect(peopleItem(null).state).toBe('unknown');
    expect(peopleItem(failed()).state).toBe('failed');
  });
});

describe('Onboarding', () => {
  it('is ready when no one waits, noting identities still provisioning apart', () => {
    expect(onboardingItem(ok({ pending: 0, provisioning: 0 }))).toMatchObject({
      state: 'ready',
      detail: 'No one is waiting for approval.',
    });
    expect(onboardingItem(ok({ pending: 2, provisioning: 2 }))).toMatchObject({
      state: 'ready',
      detail:
        'No one is waiting for approval. 2 identities are still being provisioned: approval already ran.',
    });
  });

  it('needs attention while approvals wait, and leaves provisioning ones out of the count', () => {
    expect(onboardingItem(ok({ pending: 4, provisioning: 1 }))).toMatchObject({
      state: 'attention',
      detail:
        '3 users are waiting for approval. 1 identity is still being provisioned: approval already ran.',
    });
    expect(onboardingItem(ok({ pending: 1, provisioning: 0 })).detail).toBe(
      '1 user is waiting for approval.',
    );
  });

  it("can't be checked without user.view, and fails with its read", () => {
    expect(onboardingItem(null).state).toBe('unknown');
    expect(onboardingItem(failed()).state).toBe('failed');
  });
});

describe('Business date', () => {
  it.each([
    ['OPEN', 'ready', 'Open for Mon, 7 Sep 2026.'],
    ['CLOSING', 'attention', 'Close of business is in progress for Mon, 7 Sep 2026.'],
    ['CLOSED', 'attention', 'Closed for Mon, 7 Sep 2026.'],
  ] as const)('reads %s as %s', (status, state, detail) => {
    expect(businessDateItem(ok({ date: '07-09-2026', status }))).toMatchObject({ state, detail });
  });

  it("can't be checked without business_date.view, and fails with its read", () => {
    expect(businessDateItem(null).state).toBe('unknown');
    expect(businessDateItem(failed()).state).toBe('failed');
  });
});

describe('the whole card', () => {
  const READY: ReadinessReads = {
    organisationStatus: 'ACTIVE',
    settings: ok(PROFILE_SET),
    activeBranches: ok(2),
    pendingBranches: ok(0),
    activeMembers: ok(2),
    userApprovals: ok({ pending: 0, provisioning: 0 }),
    businessDate: ok({ date: '07-09-2026', status: 'OPEN' as const }),
  };

  const EVERY_CODE = {
    permissions: [
      'settings.view',
      'branch.view',
      'membership.view',
      'user.view',
      'user.approve',
      'business_date.view',
    ],
  };
  const without = (code: string) => ({
    permissions: EVERY_CODE.permissions.filter((held) => held !== code),
  });

  it('lists the five items in spec order, all ready, with a full bar', () => {
    const view = operationalReadiness(READY, EVERY_CODE);
    expect(view.items.map((entry) => [entry.label, entry.state])).toEqual([
      ['Institution profile', 'ready'],
      ['Branches', 'ready'],
      ['People', 'ready'],
      ['Onboarding', 'ready'],
      ['Business date', 'ready'],
    ]);
    expect(view).toMatchObject({ ready: 5, progress: 100, summary: '5 of 5 ready' });
  });

  it('never counts an item it could not check as ready, and says how many it could not', () => {
    const view = operationalReadiness(
      {
        ...READY,
        settings: null,
        activeMembers: failed(),
        businessDate: ok({ date: '07-09-2026', status: 'CLOSED' as const }),
      },
      EVERY_CODE,
    );
    expect(view.items.map((entry) => entry.state)).toEqual([
      'unknown',
      'ready',
      'failed',
      'ready',
      'attention',
    ]);
    expect(view).toMatchObject({
      ready: 2,
      progress: 40,
      summary: '2 of 5 ready · 2 not checked',
    });
  });

  it('links each item to the page where it is dealt with (Ruling 12)', () => {
    expect(operationalReadiness(READY, EVERY_CODE).items.map((entry) => entry.link)).toEqual([
      { href: '/admin/settings', label: 'Open settings' },
      { href: '/admin/branches', label: 'Open branches' },
      { href: '/admin/users', label: 'Open users & access' },
      { href: '/admin/approvals/users', label: 'Open user onboarding' },
      { href: '/admin/business-date', label: 'Open business date' },
    ]);
  });

  it.each([
    ['Institution profile', 'settings.view'],
    ['Branches', 'branch.view'],
    ['People', 'user.view'],
    ['Onboarding', 'user.approve'],
    ['Onboarding', 'user.view'],
    ['Business date', 'business_date.view'],
  ])('offers no %s link without %s, the code its page needs', (label, code) => {
    const view = operationalReadiness(READY, without(code));
    expect(view.items.find((entry) => entry.label === label)?.link).toBeNull();
    expect(view.items.filter((entry) => entry.link === null)).toHaveLength(
      code === 'user.view' ? 2 : 1,
    );
  });

  it.each([
    ['ready', ok(2)],
    ['attention', ok(1)],
    ['unknown', null],
    ['failed', failed(null)],
  ] as const)('keeps a link while its item is %s', (state, activeMembers) => {
    const view = operationalReadiness({ ...READY, activeMembers }, EVERY_CODE);
    expect(view.items[2]).toMatchObject({
      state,
      link: { href: '/admin/users', label: 'Open users & access' },
    });
  });

  it("gates the navigation's pages on their navigation codes, and never names the audit trail", () => {
    for (const { href, codes, label } of Object.values(READINESS_LINKS)) {
      expect(label).not.toMatch(/audit trail/i);
      if (href === USER_QUEUE_HREF) {
        expect(codes).toEqual(USER_APPROVAL_CODES); // the tab's own gate: both of 12's codes
      } else {
        const page = administrationNavigationItems.find((entry) => entry.href === href);
        expect(page?.requiresAny).toEqual(codes);
      }
    }
  });
});
