import { describe, expect, it } from 'vitest';
import { invitationResultSchema } from './invite-contract';

const USER = '11000000-0000-4000-8000-0000000000e1';

describe('invitationResultSchema', () => {
  it('reads the new user id from UserInvitationResult (contract §C)', () => {
    expect(
      invitationResultSchema.parse({
        user_id: USER,
        membership_id: '11000000-0000-4000-8000-0000000000e2',
        user_status: 'DRAFT',
        membership_status: 'PENDING_APPROVAL',
      }),
    ).toEqual({ userId: USER });
  });

  it('needs nothing else: a reused account answers with its own status (Ruling 8)', () => {
    expect(invitationResultSchema.parse({ user_id: USER, user_status: 'ACTIVE' })).toEqual({
      userId: USER,
    });
  });

  it('refuses an echo without a well-formed id', () => {
    expect(invitationResultSchema.safeParse({ userId: USER }).success).toBe(false);
    expect(invitationResultSchema.safeParse({ user_id: '../x' }).success).toBe(false);
  });
});
