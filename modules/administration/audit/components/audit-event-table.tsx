import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';

export interface AuditRow {
  id: string;
  date: string;
  time: string;
  actorLabel: string;
  actorFilterHref: string | null;
  actionLabel: string;
  action: string;
  reason: string | null;
  entityLabel: string;
  branchLabel: string;
  outcome: string;
  severity: string;
  detailHref: string;
}

export function AuditEventTable({
  rows,
  timeZone,
}: {
  rows: readonly AuditRow[];
  timeZone: string;
}) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Audit events" sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>Date &amp; time ({timeZone})</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Entity</TableCell>
            <TableCell>Branch</TableCell>
            <TableCell>Outcome</TableCell>
            <TableCell>Severity</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Typography variant="body2">{row.date}</Typography>
                <Link
                  component={NextLink}
                  href={row.detailHref}
                  scroll={false}
                  variant="caption"
                  aria-label={`View event: ${row.actionLabel}, ${row.date} ${row.time}`}
                >
                  {row.time}
                  <LinkPendingIndicator />
                </Link>
              </TableCell>
              <TableCell>
                {row.actorFilterHref ? (
                  <Link
                    component={NextLink}
                    href={row.actorFilterHref}
                    scroll={false}
                    variant="body2"
                    noWrap
                    title={row.actorLabel}
                    sx={{ display: 'block', maxWidth: 200 }}
                  >
                    {row.actorLabel}
                    <LinkPendingIndicator />
                  </Link>
                ) : (
                  <TruncatedText value={row.actorLabel} maxWidth={200} />
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {row.actionLabel}
                </Typography>
                <Box>
                  <Typography component="span" variant="caption" color="text.secondary">
                    {row.action}
                  </Typography>
                </Box>
                {row.reason && (
                  <TruncatedText
                    value={row.reason}
                    maxWidth={320}
                    variant="caption"
                    color="text.secondary"
                  />
                )}
              </TableCell>
              <TableCell>
                <TruncatedText value={row.entityLabel} maxWidth={240} />
              </TableCell>
              <TableCell>
                <TruncatedText value={row.branchLabel} maxWidth={180} />
              </TableCell>
              <TableCell>
                <StatusChip value={row.outcome} />
              </TableCell>
              <TableCell>
                <StatusChip value={row.severity} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
