import type { Metadata } from 'next';
import { toSearchParams } from '@/lib/api/query-string';
import { RecordAuditTab } from '@/modules/administration/audit/components/record-audit-tab';

export const metadata: Metadata = { title: 'Role audit trail' };

interface RoleAuditPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** One view (Ruling 13): role assignments are audited per assignment id, which the audit API
 * can't filter by role (contract §G, BG-16). */
export default async function RoleAuditPage({ params, searchParams }: RoleAuditPageProps) {
  const { roleId } = await params;
  return (
    <RecordAuditTab
      views={[
        { value: 'role', label: 'Role record', filter: { entityType: 'ROLE', entityId: roleId } },
      ]}
      params={toSearchParams(await searchParams)}
      path={`/admin/roles/${roleId}/audit`}
      description="Changes to this role's definition, status, and permissions. Assignment changes are recorded on each assignment, not here."
    />
  );
}
