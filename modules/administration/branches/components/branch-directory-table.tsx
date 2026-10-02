import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { ListSort } from '@/lib/api/list-sort';
import { formatInstant } from '@/lib/format';
import type { BranchSortField, BranchSummary } from '../branch-contract';
import { branchTypeLabel } from '../branch-rules';

const COLUMNS: readonly { field: BranchSortField; label: string }[] = [
  { field: 'branchName', label: 'Branch' },
  { field: 'branchCode', label: 'Code' },
  { field: 'branchType', label: 'Type' },
  { field: 'status', label: 'Status' },
  { field: 'createdAt', label: 'Created' },
];

interface BranchDirectoryTableProps {
  branches: readonly BranchSummary[];
  sort: ListSort<BranchSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: BranchSortField) => string;
  timeZone: string;
}

/** The branch directory (spec §10.3): every header is a server-built sort link. */
export function BranchDirectoryTable({
  branches,
  sort,
  sortHref,
  timeZone,
}: BranchDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Branches" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ field, label }) => {
              const active = sort.by === field;
              const direction = active && sort.dir === 'DESC' ? 'desc' : 'asc';
              return (
                <TableCell key={field} sortDirection={active ? direction : false}>
                  <TableSortLabel
                    component={NextLink}
                    href={sortHref(field)}
                    active={active}
                    direction={direction}
                  >
                    {label}
                    <LinkPendingIndicator />
                  </TableSortLabel>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {branches.map((branch) => (
            <TableRow key={branch.id}>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/admin/branches/${branch.id}`}
                  variant="body2"
                  noWrap
                  title={branch.branchName}
                  sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
                >
                  {branch.branchName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {branch.branchCode}
                </Typography>
              </TableCell>
              <TableCell>
                <TruncatedText value={branchTypeLabel(branch.branchType)} maxWidth={180} />
              </TableCell>
              <TableCell>
                <StatusChip value={branch.status} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatInstant(branch.createdAt, timeZone).date}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
