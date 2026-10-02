import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';
import { canViewActivity } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Activity · Profile' };

interface ProfileActivityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Spec §10.9: own audit events (`actor_id` = your `/auth/me` user id), when audit.view. */
export default async function ProfileActivityPage({ searchParams }: ProfileActivityPageProps) {
  const { user, context } = await requireProfile();

  if (!canViewActivity(user, context.module.id)) {
    return (
      <Paper>
        {context.module.id === 'platform-administration' ? (
          // BG-06: the tenant audit API rejects the platform context; there is no platform audit.
          <ForbiddenState
            title="Activity isn't available in the platform workspace"
            description="Your actions are recorded in each institution's audit trail, which can only be read from inside that institution."
          />
        ) : (
          <ForbiddenState description="Seeing your activity needs the audit permission (audit.view) in this context. Ask an administrator if you need it." />
        )}
      </Paper>
    );
  }

  return (
    <RecordAuditTab
      views={[{ value: 'performed', label: 'Performed by me', filter: { actorId: user.id } }]}
      params={toSearchParams(await searchParams)}
      path="/profile/activity"
      title="Activity"
      description={`Administrative actions you performed in ${user.organization.name}.`}
    />
  );
}
