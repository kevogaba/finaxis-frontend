import type {
  NotificationEntry,
  NotificationsMenuProps,
} from '@/components/shell/notifications-menu';
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

/** A settled count, structurally `Loaded<T>` (lib/api/load.ts is server-only); `null`: the holder
 * isn't permitted, so nothing was read. */
export type CountRead<T> = { ok: true; value: T } | { ok: false } | null;

export const NOTHING_WAITING = 'Nothing is waiting for your approval.';
export const APPROVALS_UNAVAILABLE = "Pending approvals couldn't be loaded. Refresh to try again.";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** With a branch selected, activation needs All branches (BG-03), which an account that works at a
 * single branch can't select (the queue's own note says the same, `branchQueueContextNote`). */
const branchContextHint = (canSwitch: boolean) =>
  canSwitch
    ? ' Switch to All branches to activate them.'
    : ' Ask an administrator who works at institution level to activate them.';

/** The tenant bell (spec §8, BG-22). Any permitted read that failed makes the whole count unknown:
 * a part that failed must never read as none (Ruling 9). */
export function approvalNotifications(input: {
  users: CountRead<UserApprovalCounts>;
  branches: CountRead<number>;
  /** A branch is selected: pending branches can be listed but only activated at All branches. */
  branchSelected: boolean;
  /** The account can select All branches (more than one ACTIVE branch); one that works at a single
   * branch is told who can activate instead. Required, so no caller gets the switch advice by
   * omission; read only with `branchSelected`. */
  canSwitch: boolean;
}): NotificationsMenuProps {
  const common = { emptyText: NOTHING_WAITING, unavailableText: APPROVALS_UNAVAILABLE };
  if (input.users?.ok === false || input.branches?.ok === false) {
    return { ...common, label: "Notifications (couldn't be loaded)", total: null, entries: [] };
  }
  const users = input.users ? actionableUserApprovals(input.users.value) : 0;
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
      text: `${branches} ${plural(branches, 'branch is', 'branches are')} waiting for activation.${
        input.branchSelected ? branchContextHint(input.canSwitch) : ''
      }`,
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
