import type { Metadata } from 'next';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { StatusChip } from '@/components/data-display/status-chip';
import { NameCell } from '@/modules/profile/components/name-cell';
import { PermissionGroups } from '@/modules/profile/components/permission-groups';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { groupPermissions } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Roles & permissions · Profile' };

export default async function ProfileRolesPage() {
  const { user, context } = await requireProfile();
  const groups = groupPermissions(user.permissions);
  const where = `${user.organization.name} · ${context.branch?.name ?? 'All branches'}`;

  return (
    <Stack spacing={4}>
      <ProfileSection
        title="Roles"
        description="Every role assigned to you in this organisation, at any scope. A disabled role grants nothing."
      >
        {user.assignedRoles.length === 0 ? (
          <EmptyState title="No application roles assigned" />
        ) : (
          <TableContainer>
            <Table aria-label="Roles">
              <TableHead>
                <TableRow>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {user.assignedRoles.map((role) => (
                  <TableRow key={role.id}>
                    <NameCell name={role.name} code={role.code} />
                    <TableCell>
                      <StatusChip value={role.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ProfileSection>

      <ProfileSection
        title="Effective permissions"
        description={`What you can do in ${where}. Branch-scoped grants count only while their branch is selected.`}
      >
        {groups.length === 0 ? (
          <EmptyState title="No application permissions assigned" />
        ) : (
          <PermissionGroups groups={groups} />
        )}
      </ProfileSection>
    </Stack>
  );
}
