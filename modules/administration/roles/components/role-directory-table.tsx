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
import type { ListSort } from '@/lib/api/list-sort';
import type { RoleSortField, RoleSummary } from '../role-contract';
import { roleTypeLabel } from '../role-rules';

// Type has no sort field in the contract's allow-list, so it is the one plain header (Ruling 3).
const COLUMNS: readonly { field: RoleSortField | null; label: string }[] = [
  { field: 'roleName', label: 'Role' },
  { field: 'roleCode', label: 'Code' },
  { field: null, label: 'Type' },
  { field: 'status', label: 'Status' },
];

interface RoleDirectoryTableProps {
  roles: readonly RoleSummary[];
  sort: ListSort<RoleSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: RoleSortField) => string;
}

/** The role directory (spec §10.4): only what role summaries carry (Ruling 2). Rows carry no
 * hover highlight, since only the name link navigates (Ruling 4). */
export function RoleDirectoryTable({ roles, sort, sortHref }: RoleDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Roles" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ field, label }) => {
              if (field === null) return <TableCell key={label}>{label}</TableCell>;
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
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/admin/roles/${role.id}`}
                  variant="body2"
                  noWrap
                  title={role.roleName}
                  sx={{ display: 'block', maxWidth: 360, fontWeight: 700 }}
                >
                  {role.roleName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {role.roleCode}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{roleTypeLabel(role.systemRole)}</TableCell>
              <TableCell>
                <StatusChip value={role.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
