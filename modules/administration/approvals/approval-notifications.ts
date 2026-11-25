import type {
  NotificationEntry,
  NotificationsMenuProps,
} from '@/components/shell/notifications-menu';
import type { PendingCounts } from './approval-contract';
import { BRANCH_QUEUE_HREF, USER_QUEUE_HREF } from './approval-rules';

// ── The bell's arithmetic (spec §8, Ruling 9) ────────────────────────────────────────────────────

export interface UserApprovalCounts {
  /** Memberships PENDING_APPROVAL. */
  pending: number;
  /** Of those, the ones whose user is PROVISIONING_IDP: approval already ran (BG-11). */
  provisioning: number;
}

/** The two reads aren't atomic (a decision can land between them), so the difference is clamped. */
export function actionableUserApprovals(counts: UserApprovalCounts): number {
  return Math.max(0, counts.pending - counts.provisioning);
}

/** The bell's user line (BG-22). The platform's `memberships` leaves out the requests the caller
 * created (while the tenant's switch is on) but counts identities still provisioning; the queue's
 * total (`actionableUserApprovals`) leaves those out but counts every inviter's, the caller's own
 * included. Subtracting the provisioning read from the platform's count would remove a caller's own
 * provisioning request twice, and could read none while someone waits: both are upper bounds on
 * what the caller can decide, so the bell takes the lower. Exact while the caller has no request of
 * their own pending; otherwise never below what waits for them. */
export function bellUserApprovals(memberships: number, counts: UserApprovalCounts): number {
  return Math.min(memberships, actionableUserApprovals(counts));
}

/** A settled read, structurally `Loaded<T>` (lib/api/load.ts is server-only). Not the overview's
 * `Settled` (readiness-rules.ts), which keeps the problem and allows `null`. */
export type SettledRead<T> = { ok: true; value: T } | { ok: false };

/** A settled count; `null`: the holder isn't permitted, so nothing was read. */
export type CountRead<T> = SettledRead<T> | null;

export const NOTHING_WAITING = 'Nothing is waiting for your approval.';
export const APPROVALS_UNAVAILABLE = "Pending approvals couldn't be loaded. Refresh to try again.";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The approvals' words (spec §8), as the bell, the overview's Pending approvals card and its
 * Onboarding item say them: one entry per kind counted above zero (`null`: not counted). Any count
 * that failed makes the whole count unknown: a part that failed must never read as none (Ruling 9). */
export function approvalNotifications(input: {
  /** Users the holder can decide. */
  users: CountRead<number>;
  branches: CountRead<number>;
}): NotificationsMenuProps {
  const common = { emptyText: NOTHING_WAITING, unavailableText: APPROVALS_UNAVAILABLE };
  if (input.users?.ok === false || input.branches?.ok === false) {
    return { ...common, label: "Notifications (couldn't be loaded)", total: null, entries: [] };
  }
  const users = input.users ? input.users.value : 0;
  const branches = input.branches ? input.branches.value : 0;
  const entries: NotificationEntry[] = [];
  if (users > 0) {
    entries.push({
      id: 'user-onboarding',
      text: `${users} ${plural(users, 'user is', 'users are')} waiting for approval.`,
      href: USER_QUEUE_HREF,
      linkLabel: 'Review user onboarding',
    });
  }
  if (branches > 0) {
    entries.push({
      id: 'branch-activation',
      text: `${branches} ${plural(branches, 'branch is', 'branches are')} waiting for activation.`,
      href: BRANCH_QUEUE_HREF,
      linkLabel: 'Review branch activation',
    });
  }
  const total = users + branches;
  return {
    ...common,
    label:
      total === 0
        ? 'Notifications: nothing waiting'
        : `Notifications: ${total} ${plural(total, 'approval', 'approvals')} waiting`,
    total,
    entries,
  };
}

/** The tenant bell (BG-22): the kinds the platform counted, since a key it left out is a kind the
 * caller can't approve, never 0 of it. The user line is also the User onboarding tab's (whose
 * totals cap it, `bellUserApprovals`, and which it links to), so it needs that read too. */
export function bellNotifications(input: {
  /** `GET /tenant/approvals/pending-count`, read whenever the bell shows. */
  pending: SettledRead<PendingCounts>;
  /** The User onboarding tab's totals; `null` when not read (no tenant-wide `user.view`). */
  users: CountRead<UserApprovalCounts>;
}): NotificationsMenuProps {
  const { pending, users } = input;
  if (!pending.ok) return approvalNotifications({ users: { ok: false }, branches: null });
  const { memberships, branches } = pending.value;
  return approvalNotifications({
    users:
      memberships === undefined || users === null
        ? null
        : users.ok
          ? { ok: true, value: bellUserApprovals(memberships, users.value) }
          : users,
    branches: branches === undefined ? null : { ok: true, value: branches },
  });
}
