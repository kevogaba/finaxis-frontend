import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { PermissionRiskLevel } from '../role-contract';
import { moduleLabel } from '../role-rules';
import { RemovePermissionButton } from './role-permission-actions';

export interface RolePermissionRow {
  grantId: string;
  code: string;
  /** null when the catalogue isn't readable (no `permission.view`) or lacks the code. */
  name: string | null;
  module: string | null;
  risk: PermissionRiskLevel | null;
  /** Already formatted in the organisation's timezone. */
  grantedAt: string;
}

interface RolePermissionsTableProps {
  rows: readonly RolePermissionRow[];
  roleId: string;
  canRemove: boolean;
  timeZone: string;
  /** I2: forwarded to each row's removal confirmation. */
  contextOrganisationId?: string;
}

export function RolePermissionsTable({
  rows,
  roleId,
  canRemove,
  timeZone,
  contextOrganisationId,
}: RolePermissionsTableProps) {
  return (
    // Keyboard-scrollable at 375 px even when no row holds a button (07's history-table rule).
    <TableContainer tabIndex={0} role="region" aria-label="Granted permissions">
      <Table aria-label="Granted permissions" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell>Permission</TableCell>
            <TableCell>Module</TableCell>
            <TableCell>Risk</TableCell>
            <TableCell>Granted ({timeZone})</TableCell>
            {canRemove && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.grantId}>
              <TableCell>
                <TruncatedText value={row.name ?? row.code} maxWidth={300} />
                {row.name && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                  >
                    {row.code}
                  </Typography>
                )}
              </TableCell>
              <TableCell>{row.module ? moduleLabel(row.module) : '—'}</TableCell>
              <TableCell>{row.risk ? <StatusChip value={row.risk} /> : '—'}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.grantedAt}</TableCell>
              {canRemove && (
                <TableCell align="right">
                  <RemovePermissionButton
                    roleId={roleId}
                    grantId={row.grantId}
                    label={row.name ?? row.code}
                    // An unknown risk (catalogue unreadable) confirms as critical (Ruling 7).
                    critical={row.risk === 'CRITICAL' || row.risk === null}
                    riskUnknown={row.risk === null}
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
