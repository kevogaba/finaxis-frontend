import { z } from 'zod';
import { uuidSchema } from '@/lib/api/wire';

/**
 * UserInvitationResult (contract §C): `user_id`, `membership_id`, `user_status` (DRAFT for a new
 * user, else the reused account's) and `membership_status` (PENDING_APPROVAL). Only the id the
 * redirect needs is read: the invitation exists once the POST answered 201, so nothing else in the
 * echo may turn it into a failure (Ruling 8).
 */
export const invitationResultSchema = z
  .object({ user_id: uuidSchema })
  .transform((result) => ({ userId: result.user_id }));

export type InvitationResult = z.output<typeof invitationResultSchema>;
