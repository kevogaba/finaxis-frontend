import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import { SYSTEM_ROLE_NOTE, roleTypeLabel } from '@/modules/administration/roles/role-rules';
import {
  countActiveRoleAssignments,
  countRolePermissions,
  getRole,
} from '@/modules/administration/roles/role-service';

interface RoleOverviewPageProps {
  params: Promise<{ roleId: string }>;
}

export default async function RoleOverviewPage({ params }: RoleOverviewPageProps) {
  const { roleId } = await params;
  const [role, selected, timeZone] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [permissions, assignments] = await Promise.all([
    countRolePermissions(roleId),
    can(holder, 'role_assignment.view')
      ? countActiveRoleAssignments(roleId)
      : Promise.resolve(null),
  ]);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  const items: DescriptionItem[] = [
    { label: 'Role name', value: record.roleName },
    { label: 'Role code', value: record.roleCode },
    { label: 'Description', value: record.description ?? '—' },
    { label: 'Type', value: roleTypeLabel(record.systemRole) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    ...(permissions === null ? [] : [{ label: 'Permissions', value: String(permissions) }]),
    // Assignments, not distinct users: one user can hold the role at several scopes (Ruling 11).
    ...(assignments === null ? [] : [{ label: 'Active assignments', value: String(assignments) }]),
    { label: `Created (${timeZone})`, value: at(record.createdAt) },
    { label: `Updated (${timeZone})`, value: at(record.updatedAt) },
    { label: 'Role ID', value: <CopyIdButton value={record.id} label="Role ID" /> },
  ];

  return (
    <SectionCard
      title="Role definition"
      description={record.systemRole ? SYSTEM_ROLE_NOTE : undefined}
    >
      <DescriptionList items={items} />
    </SectionCard>
  );
}
