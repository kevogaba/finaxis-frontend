import { Suspense } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { permissionHolder } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { administrationModule } from '@/modules/administration/administration-module';
import { bellNotifications } from '@/modules/administration/approvals/approval-notifications';
import {
  canCountPendingApprovals,
  canCountUserApprovals,
} from '@/modules/administration/approvals/approval-rules';
import {
  countUserApprovals,
  readPendingCounts,
} from '@/modules/administration/approvals/approval-service';
import { NotificationsMenu } from './notifications-menu';

/** Exported for its test. The authenticated layout builds every workspace's slot, so this renders in
 * the platform context too: it reads nothing outside the administration workspace, and nothing a
 * holder can't act on (Ruling 9). */
export async function PendingApprovalNotifications() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') return null;
  if (selected.context.module.id !== administrationModule.id) return null;
  const holder = permissionHolder(selected.profile);
  // BG-22: the count route refuses a caller who approves neither kind tenant-wide, and the user
  // line needs the User onboarding tab's totals too, so only a caller the bell can show a line to
  // asks it; the lines shown are the kinds it counted. Those totals cap the user line
  // (`bellUserApprovals`), read beside it, not after it.
  if (!canCountPendingApprovals(holder)) return null;
  // Each read is settled by load() as the platform bell's is (rule 21): a lost session or a stale
  // context redirects; any other failure reads as unknown, never as none (Ruling 9).
  const [pending, users] = await Promise.all([
    load(readPendingCounts()),
    canCountUserApprovals(holder) ? load(countUserApprovals()) : null,
  ]);
  return <NotificationsMenu {...bellNotifications({ pending, users })} />;
}

/** Tenant workspace notifications slot (spec §8): its own boundary, so the shell never waits. */
export function TenantNotifications() {
  return (
    <Suspense fallback={null}>
      <PendingApprovalNotifications />
    </Suspense>
  );
}
