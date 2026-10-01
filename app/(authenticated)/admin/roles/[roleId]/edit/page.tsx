import type { Metadata } from 'next';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { load } from '@/lib/api/load';
import { SYSTEM_ROLE_NOTE, canEditRole } from '@/modules/administration/roles/role-rules';
import { getRole } from '@/modules/administration/roles/role-service';
import { RoleForm } from '@/modules/administration/roles/components/role-form';

export const metadata: Metadata = { title: 'Edit role' };

interface EditRolePageProps {
  params: Promise<{ roleId: string }>;
}

/** Edit as a page, not a dialog (Ruling 8): the layout's hero stays above it. */
export default async function EditRolePage({ params }: EditRolePageProps) {
  const { roleId } = await params;
  const [role, selected] = await Promise.all([load(getRole(roleId)), getCurrentContextProfile()]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  if (!canEditRole(record, { permissions: resolved?.profile.permissions ?? [] })) {
    return (
      <SectionCard title="Edit role">
        <ForbiddenState description={record.systemRole ? SYSTEM_ROLE_NOTE : undefined} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Edit role" description="Change the name or replace the description.">
      <RoleForm
        role={{
          id: record.id,
          roleCode: record.roleCode,
          roleName: record.roleName,
          description: record.description,
        }}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </SectionCard>
  );
}
