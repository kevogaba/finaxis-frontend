import { Suspense } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { pendingApprovalNotifications } from '@/modules/platform-administration/overview/overview-rules';
import { countTenantsInStatus } from '@/modules/platform-administration/overview/overview-service';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import { NotificationsMenu } from './notifications-menu';

/** The approver's codes: the badge counts what they can act on (Ruling 11). */
const BADGE_CODES = ['tenant.approve', 'tenant.view'] as const;

/** Exported for its test. The authenticated layout builds every workspace's slot, so this renders
 * in tenant contexts too: it reads nothing outside the platform workspace. */
export async function PendingInstitutionsNotifications() {
  const selected = await getCurrentContextProfile();
  if (selected.kind !== 'resolved') return null;
  if (selected.context.module.id !== platformAdministrationModule.id) return null;
  if (!canAll({ permissions: selected.profile.permissions }, BADGE_CODES)) return null;
  // BG-22: no feed; one `size=1` read, settled as 10's user record settles getUserInviter (rule 21):
  // load() keeps a redirect propagating and sends a lost session to sign-in and a stale context to
  // context selection; any other failure reads as unknown, never as none (rule 9).
  const read = await load(countTenantsInStatus('PENDING_APPROVAL'));
  return <NotificationsMenu {...pendingApprovalNotifications(read.ok ? read.value : null)} />;
}

/** Platform workspace notifications slot (spec §8): its own boundary, so the shell never waits. */
export function PlatformNotifications() {
  return (
    <Suspense fallback={null}>
      <PendingInstitutionsNotifications />
    </Suspense>
  );
}
