import { describe, expect, it } from 'vitest';
import {
  APPROVED_TOAST,
  approvalOutcome,
  BRANCHES_CAPPED,
  decisionCopy,
  REQUESTED_ACCESS_CEILING,
  ROLES_CAPPED,
} from './approval-copy';

describe('the decisions', () => {
  it('words each dialog, with Reject & revoke the only destructive one', () => {
    // Decision Q7 (BG-01): Approve takes an optional remark.
    expect(decisionCopy('approve', 'Amina Odhiambo')).toMatchObject({
      label: 'Approve',
      title: 'Approve Amina Odhiambo?',
      reason: 'optional',
      reasonLabel: 'Remark (optional)',
      reasonHelperText: 'Recorded with the approval. Up to 500 characters.',
      destructive: false,
    });
    expect(decisionCopy('approve', 'Amina').description).toContain("An approval can't be undone.");
    expect(decisionCopy('reject', 'Amina Odhiambo')).toMatchObject({
      label: 'Reject & revoke',
      title: 'Reject and revoke Amina Odhiambo?',
      reason: 'required',
      destructive: true,
    });
    expect(decisionCopy('activate', 'Kericho Branch')).toMatchObject({
      label: 'Activate',
      title: 'Activate Kericho Branch?',
      reason: 'optional',
      destructive: false,
    });
    // The branch record's words: one route, two intents.
    expect(decisionCopy('return', 'Kericho Branch')).toMatchObject({
      label: 'Return for changes',
      title: 'Return Kericho Branch for changes?',
      description: 'It goes back to draft. Its maker sees your reason.',
      reason: 'required',
      reasonLabel: 'What needs to change',
      destructive: false,
    });
    expect(decisionCopy('withdraw', 'Kericho Branch')).toMatchObject({
      label: 'Withdraw',
      title: 'Withdraw Kericho Branch?',
      reason: 'required',
      destructive: false,
    });
  });

  it('reads a 200 from an ACTIVE echo and a 202 from a pending one (Ruling 10)', () => {
    expect(approvalOutcome({ membershipStatus: 'ACTIVE', userStatus: 'INVITED' })).toBe('active');
    expect(
      approvalOutcome({ membershipStatus: 'PENDING_APPROVAL', userStatus: 'PROVISIONING_IDP' }),
    ).toBe('provisioning');
    // The membership status alone decides: a revoked or suspended echo is never "queued".
    expect(approvalOutcome({ membershipStatus: 'REVOKED', userStatus: 'PROVISIONING_IDP' })).toBe(
      'recorded',
    );
    expect(approvalOutcome(null)).toBe('recorded');
  });
});

describe('the pages’ copy', () => {
  it('words a 200, a 202 and an unreadable echo differently', () => {
    expect(new Set(Object.values(APPROVED_TOAST)).size).toBe(3);
  });

  it('names the ceiling in the roles’ and the branches’ notes', () => {
    expect(REQUESTED_ACCESS_CEILING).toBe(100);
    expect(ROLES_CAPPED).toBe(
      'Only the first 100 role assignments are shown. Their record lists them all.',
    );
    expect(BRANCHES_CAPPED).toBe(
      'Only the first 100 branch assignments are shown. Their record lists them all.',
    );
  });
});
