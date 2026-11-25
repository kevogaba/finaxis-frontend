import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canTenantWide, permissionHolder } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  ARCHIVED_ROLE_NOTE,
  canArchiveRole,
  canEditRole,
  HELD_ROLE,
  roleStatusAction,
  roleTypeLabel,
} from '@/modules/administration/roles/role-rules';
import {
  countActiveRoleAssignments,
  getRole,
  holdsRole,
} from '@/modules/administration/roles/role-service';
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
  const profile = resolved?.profile;
  const holder = permissionHolder(profile);
  const offered = roleStatusAction(record, holder, false);
  // Whether you hold it, as the platform counts it (#342): `/auth/me` lists ACTIVE roles only, so
  // a DISABLED one takes the one read. The backend's id, not the URL's: UUID_PATTERN is
  // case-insensitive, and a mixed-case URL must still warn the holder (Ruling 12).
  const heldByMe =
    offered !== null &&
    profile !== undefined &&
    (profile.roles.some((held) => held.id === record.id) ||
      (record.status === 'DISABLED' &&
        can(holder, 'role_assignment.view') &&
        (await holdsRole(record.id, profile.user_id))));
  // Offered to your codes but refused because you hold it: shown disabled with the reason.
  const blocked = offered !== null && roleStatusAction(record, holder, heldByMe) === null;
  const editable = canEditRole(record, holder);
  const archivable = canArchiveRole(record, holder);
  // Archive is refused while an ACTIVE assignment remains. A branch-scoped role_assignment.view
  // reads only its branches' rows, so only a tenant-wide one gives the whole count; the Overview
  // shares this cached read.
  const activeAssignments =
    archivable && canTenantWide(holder, 'role_assignment.view')
      ? await countActiveRoleAssignments(roleId)
      : null;
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
          editable || offered || archivable ? (
            <RoleLifecycleActions
              roleId={roleId}
              roleName={record.roleName}
              editHref={editable ? `${base}/edit` : undefined}
              action={offered}
              archive={archivable ? { roleCode: record.roleCode, activeAssignments } : undefined}
              blocked={blocked ? HELD_ROLE : undefined}
              heldByMe={heldByMe}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      {record.status === 'ARCHIVED' && (
        <Alert severity="info" role="note" sx={{ mt: 3.5 }}>
          {ARCHIVED_ROLE_NOTE}
        </Alert>
      )}
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
