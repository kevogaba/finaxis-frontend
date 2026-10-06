import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { parseUserId } from '@/modules/administration/users/user-rules';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';
import { AccountRecord } from '@/modules/platform-administration/users/components/account-record';
import { institutionUsersHref } from '@/modules/platform-administration/users/institution-user-query';
import { getInstitutionUser } from '@/modules/platform-administration/users/institution-user-service';

export const metadata: Metadata = { title: 'User record' };

const FALLBACK_EYEBROW = 'Platform administration · Institution user';

interface InstitutionUserPageProps {
  params: Promise<{ tenantId: string; userId: string }>;
}

/** A person as an institution's user (spec §11.2): its own hero, so the account's actions never
 * share a page with the institution's own Suspend and Deprovision (Ruling 1). */
export default async function InstitutionUserPage({ params }: InstitutionUserPageProps) {
  const raw = await params;
  const tenantId = parseInstitutionId(raw.tenantId);
  const userId = parseUserId(raw.userId);
  if (!tenantId || !userId) notFound(); // rule 7: before any read

  const [user, tenant, selected] = await Promise.all([
    load(getInstitutionUser(tenantId, userId)),
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={FALLBACK_EYEBROW} title="User record" />
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
  // The institution's name only labels the page: a failed read falls back to plain words (rule 9).
  const institution = tenant.ok ? tenant.value.displayName : null;
  return (
    <AccountRecord
      user={user.value}
      scope="institution"
      back={{ href: institutionUsersHref(tenantId), label: 'Back to users' }}
      eyebrow={institution ? `Platform administration · User in ${institution}` : FALLBACK_EYEBROW}
      membershipLabel={
        institution ? `Membership in ${institution}` : 'Membership in this institution'
      }
      holder={{ permissions: resolved?.profile.permissions ?? [] }}
      signedInUserId={resolved?.profile.user_id ?? null}
      contextOrganisationId={resolved?.context.organization.id}
    />
  );
}
