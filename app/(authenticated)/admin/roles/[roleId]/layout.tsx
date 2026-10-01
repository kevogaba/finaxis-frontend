import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  canEditRole,
  roleStatusAction,
  roleTypeLabel,
} from '@/modules/administration/roles/role-rules';
import { getRole } from '@/modules/administration/roles/role-service';
import { RoleLifecycleActions } from '@/modules/administration/roles/components/role-lifecycle-actions';

export const metadata: Metadata = { title: 'Role record' };

interface RoleRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ roleId: string }>;
}

/** Record shell (spec §9): the hero role is read once here; each tab fetches its own data. Roles
 * are never branch-restricted (contract §E.4), so there is no guided state. */
export default async function RoleRecordLayout({ children, params }: RoleRecordLayoutProps) {
  const { roleId } = await params;
  if (!UUID_PATTERN.test(roleId)) notFound();

  const [role, selected] = await Promise.all([load(getRole(roleId)), getCurrentContextProfile()]);
  const resolved = selected.kind === 'resolved' ? selected : null;

  if (!role.ok) {
    if (role.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · Role record" title="Role record" />
        <Paper>
          {/* Review Focus 3: a user who revoked their own role.view lands here, never on an
              error page. */}
          {role.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={role.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = role.value;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const action = roleStatusAction(record, holder);
  const editable = canEditRole(record, holder);
  const base = `/admin/roles/${roleId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/roles', label: 'Back to roles' }}
        avatar={{ kind: 'icon', icon: <VerifiedUserOutlined /> }}
        eyebrow="Administration · Role record"
        title={record.roleName}
        subtitle={`${record.roleCode} · ${roleTypeLabel(record.systemRole)}`}
        status={<StatusChip value={record.status} />}
        actions={
          // Undefined, not an empty component: RecordHero (frozen kit) renders its actions box
          // whenever this is truthy, which would leave an empty band at 375 px (08's layout).
          editable || action ? (
            <RoleLifecycleActions
              roleId={roleId}
              roleName={record.roleName}
              editHref={editable ? `${base}/edit` : undefined}
              action={action}
              // The backend's id, not the URL's: UUID_PATTERN is case-insensitive, and a
              // mixed-case URL must still warn the holder (Ruling 12).
              heldByMe={resolved?.profile.roles.some((held) => held.id === record.id) ?? false}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.roleName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}/permissions`, label: 'Permissions' },
          ...(can(holder, 'role_assignment.view')
            ? [{ href: `${base}/assignments`, label: 'Assignments' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
