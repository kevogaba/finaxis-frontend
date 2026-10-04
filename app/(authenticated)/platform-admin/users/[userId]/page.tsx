import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { parseUserId } from '@/modules/administration/users/user-rules';
import { AccountRecord } from '@/modules/platform-administration/users/components/account-record';
import { PLATFORM_USERS_HREF } from '@/modules/platform-administration/users/institution-user-query';
import { getPlatformUser } from '@/modules/platform-administration/users/institution-user-service';

export const metadata: Metadata = { title: 'Platform user' };

const EYEBROW = 'Platform administration · Platform user';

interface PlatformUserPageProps {
  params: Promise<{ userId: string }>;
}

/** A member of the platform organisation (spec §11.3): the same account record as an institution's
 * user, read through the platform organisation's membership. */
export default async function PlatformUserPage({ params }: PlatformUserPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7: before any read

  const [user, selected] = await Promise.all([
    load(getPlatformUser(userId)),
    getCurrentContextProfile(),
  ]);
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Platform user" />
        <Paper>
          {user.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={user.problem} />
          )}
        </Paper>
      </>
    );
  }
  const resolved = selected.kind === 'resolved' ? selected : null;
  return (
    <AccountRecord
      user={user.value}
      scope="platform"
      back={{ href: PLATFORM_USERS_HREF, label: 'Back to platform users' }}
      eyebrow={EYEBROW}
      membershipLabel="Membership in the platform organisation"
      holder={{ permissions: resolved?.profile.permissions ?? [] }}
      signedInUserId={resolved?.profile.user_id ?? null}
      contextOrganisationId={resolved?.context.organization.id}
    />
  );
}
