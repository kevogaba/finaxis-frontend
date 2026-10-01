import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { getOrganisationTimeZone } from '@/lib/api/lookups';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import { formatInstant } from '@/lib/format';
import {
  canGrantPermissions,
  canRemovePermissions,
} from '@/modules/administration/roles/role-rules';
import {
  getPermissionCatalogue,
  getRole,
  listGrantedCodes,
  listRolePermissions,
} from '@/modules/administration/roles/role-service';
import { GrantPermissionsButton } from '@/modules/administration/roles/components/role-permission-actions';
import { RolePermissionsTable } from '@/modules/administration/roles/components/role-permissions-table';

export const metadata: Metadata = { title: 'Role permissions' };

interface RolePermissionsPageProps {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RolePermissionsPage({
  params,
  searchParams,
}: RolePermissionsPageProps) {
  const { roleId } = await params;
  const query = toSearchParams(await searchParams);
  const [role, selected, grants, catalogue, timeZone] = await Promise.all([
    load(getRole(roleId)), // cached: the layout's read
    getCurrentContextProfile(),
    load(listRolePermissions(roleId, parsePaging(query, 10))),
    // Cached and failure-tolerant: null without permission.view, so names fall back to codes.
    getPermissionCatalogue(),
    getOrganisationTimeZone(),
  ]);
  if (!role.ok) return null; // the layout renders the failure

  const record = role.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  // I2: the organisation this page rendered with, carried by every mutation surface below.
  const contextOrganisationId = resolved?.context.organization.id;
  // One bounded read, only when the drawer is on offer (Ruling 6).
  const granted =
    catalogue && canGrantPermissions(record, holder) ? await listGrantedCodes(roleId) : null;

  const card = (content: ReactNode) => (
    <SectionCard
      title="Permissions"
      description={
        record.systemRole
          ? "System roles are immutable: their permissions can't be changed."
          : 'Granted permissions take effect immediately for everyone holding this role.'
      }
      actions={
        catalogue && granted ? (
          <GrantPermissionsButton
            roleId={roleId}
            roleName={record.roleName}
            available={catalogue.items.filter(
              (permission) => permission.status === 'ACTIVE' && !granted.has(permission.code),
            )}
            truncated={catalogue.page.hasNext}
            contextOrganisationId={contextOrganisationId}
          />
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );

  if (!grants.ok) {
    return card(
      grants.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={grants.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(grants.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(`/admin/roles/${roleId}/permissions`, query, {
        page: redirectPage === 0 ? null : String(redirectPage),
      }),
    );
  }

  const byCode = new Map(
    catalogue?.items.map((permission) => [permission.code, permission] as const),
  );
  const rows = grants.value.items.map((grant) => {
    const permission = byCode.get(grant.permissionCode);
    const when = formatInstant(grant.grantedAt, timeZone);
    return {
      grantId: grant.id,
      code: grant.permissionCode,
      name: permission?.name ?? null,
      module: permission?.module ?? null,
      risk: permission?.risk ?? null,
      grantedAt: `${when.date} · ${when.time}`,
    };
  });

  return card(
    rows.length === 0 ? (
      <EmptyState
        title="No permissions granted"
        description={
          record.systemRole
            ? 'This system role grants no permissions.'
            : 'Holders of this role can do nothing yet. Grant permissions to give them access.'
        }
      />
    ) : (
      <>
        <RolePermissionsTable
          rows={rows}
          roleId={roleId}
          canRemove={canRemovePermissions(record, holder)}
          timeZone={timeZone}
          contextOrganisationId={contextOrganisationId}
        />
        <TablePaginationBar page={grants.value.page} />
      </>
    ),
  );
}
