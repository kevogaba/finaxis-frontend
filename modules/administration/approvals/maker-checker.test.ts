import { describe, expect, it } from 'vitest';
import { isMaker, isSameUser, makerGate, type SwitchState } from './maker-checker';

// Lettered, so upper case differs from the canonical lower case.
const ME = 'a1000000-0000-4000-8000-0000000000aa';
const VICTOR = 'b2000000-0000-4000-8000-0000000000bb';

describe('maker-checker', () => {
  it('compares user ids without letter case, and never matches an unknown one', () => {
    expect(isSameUser(ME.toUpperCase(), ME)).toBe(true);
    expect(isSameUser(ME, ME.toUpperCase())).toBe(true);
    expect(isSameUser(VICTOR, ME)).toBe(false);
    expect(isSameUser(null, ME)).toBe(false);
    expect(isSameUser(undefined, ME)).toBe(false);
    expect(isSameUser(null, null)).toBe(false);
  });

  it('finds the caller among the makers, ignoring a null (the system, or hidden)', () => {
    expect(isMaker([VICTOR, ME.toUpperCase()], ME)).toBe(true);
    expect(isMaker([null, undefined, VICTOR], ME)).toBe(false);
    expect(isMaker([], ME)).toBe(false);
  });

  // Q4: blocked only when the switch is known to be on; off lets the maker decide (audited HIGH);
  // unknown leaves Approve enabled for the platform's named refusal.
  it.each<[string, readonly (string | null | undefined)[], SwitchState, string]>([
    ['the maker, switch on', [ME], 'on', 'blocked'],
    ['the maker, switch off', [ME], 'off', 'allowed-self-approval'],
    ['the maker, switch unknown', [ME], 'unknown', 'allowed'],
    ['the submitter among two makers, switch on', [VICTOR, ME], 'on', 'blocked'],
    ['someone else, switch on', [VICTOR], 'on', 'allowed'],
    ['someone else, switch off', [VICTOR], 'off', 'allowed'],
    ['an unknown maker, switch on', [null], 'on', 'allowed'],
    ['no maker at all, switch off', [undefined], 'off', 'allowed'],
  ])('answers %s', (_case, makerIds, switchState, gate) => {
    expect(makerGate({ makerIds, callerId: ME, switchState })).toBe(gate);
  });
});
