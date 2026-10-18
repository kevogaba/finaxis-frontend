import { describe, expect, it } from 'vitest';
import {
  branchesItem,
  institutionItem,
  NOT_PERMITTED,
  peopleItem,
  READINESS_CODES,
  READINESS_STATES,
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
