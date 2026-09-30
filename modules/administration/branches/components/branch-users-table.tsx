import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { StatusChip, humanizeEnum } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { RevokeAssignmentButton } from './branch-user-actions';

export interface BranchUserRow {
  assignmentId: string;
  name: string;
  email: string | null;
  assignmentType: string;
}

interface BranchUsersTableProps {
  rows: readonly BranchUserRow[];
  canRevoke: boolean;
  /** I2: the organisation the page rendered for; forwarded to each row's revoke confirmation. */
  contextOrganisationId?: string;
}

export function BranchUsersTable({
  rows,
  canRevoke,
  contextOrganisationId,
}: BranchUsersTableProps) {
  return (
    <TableContainer>
      <Table aria-label="Branch users" sx={{ minWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Assignment type</TableCell>
            {canRevoke && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assignmentId} hover>
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
                <StatusChip value={row.assignmentType} />
              </TableCell>
              {canRevoke && (
                <TableCell align="right">
                  <RevokeAssignmentButton
                    assignmentId={row.assignmentId}
                    userLabel={row.name}
                    typeLabel={humanizeEnum(row.assignmentType)}
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
