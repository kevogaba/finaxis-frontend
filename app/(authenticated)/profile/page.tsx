import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Grid from '@mui/material/Grid';
import { auth } from '@/auth/auth';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileOverviewPage() {
  const { user, context } = await requireProfile();
  // requireProfile validated the session; this read is only for its sign-in time.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login?reason=session_expired');
  // Spec §9: the platform workspace uses UTC — it can't read GET /tenant.
  const timeZone =
    context.module.id === 'platform-administration' ? 'UTC' : await getOrganisationTimeZone();
  // `new Date(…)`: a Date from a fresh read, but tolerate a serialized value from the cookie cache.
  const signedIn = formatInstant(new Date(session.session.createdAt).toISOString(), timeZone);

  return (
    <Grid container spacing={4}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ProfileSection title="Identity" description="Your account, from the identity provider.">
          <DescriptionList
            columns={1}
            items={[
              { label: 'Full name', value: user.name },
              { label: 'Email', value: user.email || '—' },
              { label: 'User ID', value: <CopyIdButton value={user.id} label="User ID" /> },
              { label: 'Signed in', value: `${signedIn.date} · ${signedIn.time} (${timeZone})` },
            ]}
          />
        </ProfileSection>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ProfileSection title="Active context" description="Where your actions apply right now.">
          <DescriptionList
            columns={1}
            items={[
              { label: 'Workspace', value: context.module.name },
              { label: 'Organisation', value: user.organization.name },
              { label: 'Organisation code', value: user.organization.code },
              {
                label: 'Organisation status',
                value: <StatusChip value={user.organization.status} />,
              },
              {
                label: 'Branch',
                value: context.branch?.name ?? 'All branches (institution level)',
              },
              { label: 'Membership', value: <StatusChip value={user.membershipStatus} /> },
            ]}
          />
        </ProfileSection>
      </Grid>
    </Grid>
  );
}
