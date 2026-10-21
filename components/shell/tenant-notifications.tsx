import { Suspense } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { administrationModule } from '@/modules/administration/administration-module';
import { approvalNotifications } from '@/modules/administration/approvals/approval-notifications';
import {
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { NotificationsMenu } from './notifications-menu';

/** Exported for its test. The authenticated layout builds every workspace's slot, so this renders in
 * the platform context too: it reads nothing outside the administration workspace, and nothing a
 * holder can't act on (Ruling 9). */
export async function PendingApprovalNotifications() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') return null;
  if (selected.context.module.id !== administrationModule.id) return null;
  const holder = { permissions: selected.profile.permissions };
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  if (!users && !branches) return null;
  // BG-22: no feed; three `size=1` reads, each settled by load() as the platform bell's is (rule
  // 21): a lost session or a stale context redirects; any other failure reads as unknown, never
  // as none (Ruling 9).
  const [userCounts, branchCount] = await Promise.all([
    users ? load(countUserApprovals()) : null,
    branches ? load(countBranchActivations()) : null,
  ]);
  return (
    <NotificationsMenu
      {...approvalNotifications({
        users: userCounts,
        branches: branchCount,
        branchSelected: selected.context.branch !== null,
        // PF1: /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
        canSwitch:
          selected.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1,
      })}
    />
  );
}

/** Tenant workspace notifications slot (spec §8): its own boundary, so the shell never waits. */
export function TenantNotifications() {
  return (
    <Suspense fallback={null}>
      <PendingApprovalNotifications />
    </Suspense>
  );
}
