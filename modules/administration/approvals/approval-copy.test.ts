import { describe, expect, it } from 'vitest';
import {
  APPROVED_TOAST,
  approvalOutcome,
  branchQueueContextNote,
  decisionCopy,
  REQUESTED_ROLES_CEILING,
  ROLES_CAPPED,
} from './approval-copy';

describe('the decisions', () => {
  it('words each dialog, with Reject & revoke the only destructive one', () => {
    expect(decisionCopy('approve', 'Amina Odhiambo')).toMatchObject({
      label: 'Approve',
      title: 'Approve Amina Odhiambo?',
      reason: null,
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

  it('tells a branch context how to activate, or whom to ask', () => {
    expect(branchQueueContextNote('Westlands Branch', true)).toBe(
      'With Westlands Branch selected, these branches can be listed but not activated. Switch to All branches to review them.',
    );
    expect(branchQueueContextNote('Westlands Branch', false)).toBe(
      'With Westlands Branch selected, these branches can be listed but not activated, and your account works at this branch only. Ask an administrator who works at institution level to review them.',
    );
  });

  it('names the roles ceiling in its note', () => {
    expect(REQUESTED_ROLES_CEILING).toBe(100);
    expect(ROLES_CAPPED).toBe(
      'Only the first 100 role assignments are shown. Their record lists them all.',
    );
  });
});
