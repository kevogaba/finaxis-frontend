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
  /** The branch's name from the branch index, or its short id when the index is empty. */
  branchName: string;
  /** From the branch index; null when the branch isn't in it. */
  branchCode: string | null;
  assignmentType: string;
}

interface UserBranchAssignmentsTableProps {
  rows: readonly UserBranchAssignmentRow[];
  userName: string;
  canRevoke: boolean;
  /** I2: the organisation the page rendered for; forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

/** One user's branch assignments (08's `BranchUsersTable` turned around: a row names the branch,
 * not the user), so each revoke also names the branch. */
export function UserBranchAssignmentsTable({
  rows,
  userName,
  canRevoke,
  contextOrganisationId,
}: UserBranchAssignmentsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    // Not "Branch assignments": the page's section card is the region of that name, and two
    // landmarks with one name fail axe's landmark-unique.
    <TableContainer tabIndex={0} role="region" aria-label="Branch assignments table">
      <Table aria-label="Branch assignments" sx={{ minWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell>Branch</TableCell>
            <TableCell>Assignment type</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId}>
              <TableCell>
                <TruncatedText value={row.branchName} maxWidth={280} />
                {row.branchCode && (
                  <TruncatedText
                    value={row.branchCode}
                    maxWidth={280}
                    variant="caption"
                    color="textSecondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <StatusChip value={row.assignmentType} />
              </TableCell>
              {canRevoke && (
                <TableCell align="right">
                  <RevokeAssignmentButton
                    assignmentId={row.assignmentId}
                    userLabel={userName}
                    typeLabel={humanizeEnum(row.assignmentType)}
                    branchLabel={row.branchName}
                    contextOrganisationId={contextOrganisationId}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
