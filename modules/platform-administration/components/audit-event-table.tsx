import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ApiPage, AuditEvent } from '../platform-administration.types';
import { PlatformPagination } from './platform-pagination';

interface AuditEventTableProps {
  pathname: string;
  auditEventsPage: ApiPage<AuditEvent>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function outcomeColor(outcome: string): 'success' | 'error' | 'default' {
  const normalized = outcome.toLowerCase();
  if (
    normalized.includes('fail') ||
    normalized.includes('denied') ||
    normalized.includes('error')
  ) {
    return 'error';
  }
  if (normalized.includes('success') || normalized.includes('allow')) {
    return 'success';
  }
  return 'default';
}

export function AuditEventTable({ pathname, auditEventsPage }: AuditEventTableProps) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Audit events
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {auditEventsPage.page.totalItems > 0
              ? `${auditEventsPage.page.totalItems} audit events reported by the current API page metadata.`
              : 'Live audit events will appear here when records are available.'}
          </Typography>
        </Box>

        {auditEventsPage.items.length === 0 ? (
          <Alert severity="info">No audit events are available in the live directory yet.</Alert>
        ) : (
          <>
            <TableContainer>
              <Table size="small" aria-label="Audit event directory results">
                <TableHead>
                  <TableRow>
                    <TableCell>Occurred</TableCell>
                    <TableCell>Entity</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Outcome</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Actor</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditEventsPage.items.map((event) => (
                    <TableRow key={event.id} hover>
                      <TableCell>{formatDate(event.occurredAt)}</TableCell>
                      <TableCell>
                        {event.entityType}
                        {event.entityId ? ` (${event.entityId})` : ''}
                      </TableCell>
                      <TableCell>{event.action}</TableCell>
                      <TableCell>
                        <Chip
                          color={outcomeColor(event.outcome)}
                          label={event.outcome}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{event.severity}</TableCell>
                      <TableCell>{event.actorUserId ?? event.actorType}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <PlatformPagination page={auditEventsPage.page} pathname={pathname} />
          </>
        )}
      </Stack>
    </Paper>
  );
}
