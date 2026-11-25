import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip, humanizeEnum } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { RevokeAssignmentButton } from '@/modules/administration/branches/components/branch-user-actions';

export interface UserBranchAssignmentRow {
  assignmentId: string;
  /** The branch's name, embedded in the assignment (BG-09). */
  branchName: string;
  assignmentType: string;
  /** Already formatted in the organisation's timezone. */
  assignedAt: string;
  /** The holder may revoke at this row's branch (`canActAtBranch`, BG-03). */
  revocable: boolean;
}

interface UserBranchAssignmentsTableProps {
  rows: readonly UserBranchAssignmentRow[];
  userName: string;
  /** The signed-in user's own record: each revoke warns first (BG-35), as the role revoke does. */
  self: boolean;
  canRevoke: boolean;
  /** The organisation's, which the Assigned column names. */
  timeZone: string;
  /** I2: the organisation the page rendered for; forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

/** One user's branch assignments (08's `BranchUsersTable` turned around: a row names the branch,
 * not the user), so each revoke also names the branch. */
export function UserBranchAssignmentsTable({
  rows,
  userName,
  self,
  canRevoke,
  timeZone,
  contextOrganisationId,
}: UserBranchAssignmentsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    // Not "Branch assignments": the page's section card is the region of that name, and two
    // landmarks with one name fail axe's landmark-unique.
    <TableContainer tabIndex={0} role="region" aria-label="Branch assignments table">
      <Table aria-label="Branch assignments" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell>Branch</TableCell>
            <TableCell>Assignment type</TableCell>
            <TableCell>Assigned ({timeZone})</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId}>
              <TableCell>
                <TruncatedText value={row.branchName} maxWidth={280} />
              </TableCell>
              <TableCell>
                <StatusChip value={row.assignmentType} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.assignedAt}</TableCell>
              {canRevoke && (
                <TableCell align="right">
                  {row.revocable && (
                    <RevokeAssignmentButton
                      assignmentId={row.assignmentId}
                      userLabel={userName}
                      typeLabel={humanizeEnum(row.assignmentType)}
                      branchLabel={row.branchName}
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
