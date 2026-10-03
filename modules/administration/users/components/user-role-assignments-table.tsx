import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { RevokeRoleAssignmentButton } from '@/modules/administration/roles/components/role-assignment-actions';
import type { RoleScopeType } from '@/modules/administration/roles/role-contract';
import { scopeLabel } from '@/modules/administration/roles/role-rules';

export interface UserRoleAssignmentRow {
  assignmentId: string;
  /** The role's name from the role index, or its short id when the index is empty. */
  roleName: string;
  roleCode: string | null;
  /** From the role index; null when the role isn't in it. */
  roleStatus: string | null;
  scopeType: RoleScopeType;
  /** The branch name for BRANCH scope; `All branches` for TENANT. */
  branchLabel: string;
  /** False when the context can't revoke it (`isAssignmentRevocable`), so no Revoke renders. */
  revocable: boolean;
}

interface UserRoleAssignmentsTableProps {
  rows: readonly UserRoleAssignmentRow[];
  userName: string;
  /** The signed-in user's own record: revoking removes their own permissions. */
  self: boolean;
  canRevoke: boolean;
  /** I2: forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

/** One user's role assignments (09's `RoleAssignmentsTable` turned around: a row names the role,
 * not the user). */
export function UserRoleAssignmentsTable({
  rows,
  userName,
  self,
  canRevoke,
  contextOrganisationId,
}: UserRoleAssignmentsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    <TableContainer tabIndex={0} role="region" aria-label="Role assignments">
      <Table aria-label="Role assignments" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            <TableCell>Role</TableCell>
            <TableCell>Scope</TableCell>
            <TableCell>Branch</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <TruncatedText value={row.roleName} maxWidth={240} />
                  {/* A role that is not ACTIVE grants nothing (BG-27): say so beside its name. */}
                  {row.roleStatus && row.roleStatus !== 'ACTIVE' && (
                    <StatusChip value={row.roleStatus} />
                  )}
                </Box>
                {row.roleCode && (
                  <TruncatedText
                    value={row.roleCode}
                    maxWidth={280}
                    variant="caption"
                    color="textSecondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <StatusChip value={row.scopeType} label={scopeLabel(row.scopeType)} />
              </TableCell>
              <TableCell>
                <TruncatedText value={row.branchLabel} maxWidth={220} />
              </TableCell>
              {canRevoke && (
                <TableCell align="right">
                  {row.revocable && (
                    <RevokeRoleAssignmentButton
                      assignmentId={row.assignmentId}
                      userLabel={userName}
                      roleLabel={row.roleName}
                      scopeLabel={row.scopeType === 'TENANT' ? 'institution-wide' : row.branchLabel}
                      self={self}
                      contextOrganisationId={contextOrganisationId}
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
