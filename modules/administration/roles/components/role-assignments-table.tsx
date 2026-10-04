import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { RoleScopeType } from '../role-contract';
import { scopeLabel } from '../role-rules';
import { RevokeRoleAssignmentButton } from './role-assignment-actions';

export interface RoleAssignmentRow {
  assignmentId: string;
  name: string;
  email: string | null;
  scopeType: RoleScopeType;
  /** The branch name for BRANCH scope; `All branches` for TENANT. */
  branchLabel: string;
  /** The signed-in user's own assignment. */
  self: boolean;
  /** False when the context can't revoke it (`isAssignmentRevocable`), so no Revoke renders. */
  revocable: boolean;
}

interface RoleAssignmentsTableProps {
  rows: readonly RoleAssignmentRow[];
  roleName: string;
  canRevoke: boolean;
  /** I2: forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

export function RoleAssignmentsTable({
  rows,
  roleName,
  canRevoke,
  contextOrganisationId,
}: RoleAssignmentsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    <TableContainer tabIndex={0} role="region" aria-label="Role assignments">
      <Table aria-label="Role assignments" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Scope</TableCell>
            <TableCell>Branch</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId}>
              <TableCell>
                <TruncatedText value={row.name} maxWidth={280} />
                {row.email && (
                  <TruncatedText
                    value={row.email}
                    maxWidth={280}
                    variant="caption"
                    color="text.secondary"
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
                      userLabel={row.name}
                      roleLabel={roleName}
                      scopeLabel={row.scopeType === 'TENANT' ? 'institution-wide' : row.branchLabel}
                      self={row.self}
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
