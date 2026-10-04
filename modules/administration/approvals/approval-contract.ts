import { z } from 'zod';
import { MEMBERSHIP_STATUSES, USER_STATUSES } from '@/modules/administration/users/user-contract';

/** The activate response (`MembershipDetail`, contract §C): only the two statuses that tell a 200
 * (the membership is ACTIVE) from a 202 (it stays PENDING_APPROVAL while the identity is created)
 * are read. Parsed with `safeParse`: an approval that succeeded must never fail on its echo. */
export const membershipDecisionSchema = z
  .object({
    membership_status: z.enum(MEMBERSHIP_STATUSES),
    user_status: z.enum(USER_STATUSES),
  })
  .transform((detail) => ({
    membershipStatus: detail.membership_status,
    userStatus: detail.user_status,
  }));

export type MembershipDecision = z.output<typeof membershipDecisionSchema>;
