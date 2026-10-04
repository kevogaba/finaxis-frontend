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
import type { TenantSortField, TenantSummary } from '../tenant-contract';
import { countryLabel } from '../tenant-rules';

/** `null`: not sortable. Status isn't in the backend's allow-list (an unknown sort_by is a 500). */
const COLUMNS: readonly { field: TenantSortField | null; label: string }[] = [
  { field: 'displayName', label: 'Institution' },
  { field: 'tenantCode', label: 'Code' },
  { field: 'countryCode', label: 'Country' },
  { field: null, label: 'Lifecycle' },
  { field: 'createdAt', label: 'Created (UTC)' },
];

interface TenantDirectoryTableProps {
  tenants: readonly TenantSummary[];
  sort: ListSort<TenantSortField>;
  /** Server Component: this function prop never crosses to the client — keep it that way. */
  sortHref: (field: TenantSortField) => string;
}

/** The institution directory (spec §11.1): every sortable header is a server-built sort link. */
export function TenantDirectoryTable({ tenants, sort, sortHref }: TenantDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Institutions" sx={{ minWidth: 760 }}>
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
          {tenants.map((tenant) => (
            // No row hover: only the name links (08's V5).
            <TableRow key={tenant.id}>
              <TableCell>
                <Link
                  component={NextLink}
                  href={`/platform-admin/tenants/${tenant.id}`}
                  variant="body2"
                  noWrap
                  title={tenant.displayName}
                  sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
                >
                  {tenant.displayName}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {tenant.tenantCode}
                </Typography>
              </TableCell>
              <TableCell>
                <TruncatedText value={countryLabel(tenant.countryCode)} maxWidth={200} />
              </TableCell>
              <TableCell>
                <StatusChip value={tenant.status} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatInstant(tenant.createdAt, 'UTC').date}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
