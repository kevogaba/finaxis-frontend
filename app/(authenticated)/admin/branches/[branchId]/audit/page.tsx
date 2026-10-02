import type { Metadata } from 'next';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';

export const metadata: Metadata = { title: 'Branch audit trail' };

interface BranchAuditPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Branch assign/revoke are logged on the branch (contract §G), so one view covers them. */
export default async function BranchAuditPage({ params, searchParams }: BranchAuditPageProps) {
  const { branchId } = await params;
  return (
    <RecordAuditTab
      views={[
        {
          value: 'branch',
          label: 'Branch record',
          filter: { entityType: 'BRANCH', entityId: branchId },
        },
      ]}
      params={toSearchParams(await searchParams)}
      path={`/admin/branches/${branchId}/audit`}
    />
  );
}
