import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { load } from '@/lib/api/load';
import { toSearchParams } from '@/lib/api/query-string';
import {
  RecordAuditTab,
  type RecordAuditView,
} from '@/modules/administration/audit/components/record-audit-tab';
import { parseUserId } from '@/modules/administration/users/user-rules';
import { getUser } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User audit trail' };

const NOT_HERE =
  "Role and branch assignment changes are recorded on each assignment and branch, so they don't appear here.";

interface UserAuditPageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Four views (spec §10.1): one user's history spans several entity types (contract §G). */
export default async function UserAuditPage({ params, searchParams }: UserAuditPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7: before any read, like the layout (16's tab pages)
  const user = await load(getUser(userId)); // cached: the layout's read
  if (!user.ok) return null; // the layout renders the failure
  // The user read carries the membership's id (BG-09), so its view needs no membership read.
  const { membershipId } = user.value;
  const views: [RecordAuditView, ...RecordAuditView[]] = [
    { value: 'user', label: 'User record', filter: { entityType: 'USER', entityId: userId } },
    {
      value: 'account',
      label: 'Account',
      filter: { entityType: 'USER_ACCOUNT', entityId: userId },
    },
    {
      value: 'membership',
      label: 'Membership',
      filter: { entityType: 'MEMBERSHIP', entityId: membershipId },
    },
    { value: 'actor', label: 'Performed by', filter: { actorId: userId } },
  ];
  return (
    <RecordAuditTab
      views={views}
      params={toSearchParams(await searchParams)}
      path={`/admin/users/${userId}/audit`}
      description={`This user's history across their record, account and membership, and what they did. ${NOT_HERE}`}
    />
  );
}
