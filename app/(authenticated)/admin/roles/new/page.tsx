import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { canCreateRole } from '@/modules/administration/roles/role-rules';
import { RoleForm } from '@/modules/administration/roles/components/role-form';

export const metadata: Metadata = { title: 'Create role' };

export default async function NewRolePage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Roles & permissions"
      title="Create role"
      description="A new custom role starts active with no permissions. You grant them next."
    />
  );

  if (!canCreateRole({ permissions: resolved?.profile.permissions ?? [] })) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <Paper>
        <RoleForm contextOrganisationId={resolved?.context.organization.id} />
      </Paper>
    </>
  );
}
