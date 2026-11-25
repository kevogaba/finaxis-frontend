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

/** A pending count: a `COUNT(*)`, so a whole number, never negative. */
const count = z.number().int().nonnegative();

/** `GET /tenant/approvals/pending-count` (BG-22, platform #169): `memberships` for a holder of
 * `user.approve` (with `membership.view`) and `branches` for one of `branch.approve` (with
 * `branch.view`), each tenant-wide. A kind the caller can't approve has no key at all
 * (`@JsonInclude(NON_NULL)`), so a missing key and a 0 mean different things; a caller who can
 * approve neither is refused (403). Each counts the PENDING_APPROVAL rows less those the caller
 * created, unless the tenant's maker-checker switch for that kind is off; memberships include
 * identities still provisioning. The keys are single words: nothing to rename. */
export const pendingCountSchema = z.object({
  memberships: count.optional(),
  branches: count.optional(),
});

export type PendingCounts = z.output<typeof pendingCountSchema>;
