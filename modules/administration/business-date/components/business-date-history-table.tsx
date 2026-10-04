import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import type { BusinessDateHistoryEntry } from '../business-date-contract';
import { historyEventLabel } from '../business-date-rules';

interface BusinessDateHistoryTableProps {
  entries: readonly BusinessDateHistoryEntry[];
  actorNames: ReadonlyMap<string, string>;
  timeZone: string;
}

function change(from: string | null, to: string, format: (value: string) => string): string {
  return from && from !== to ? `${format(from)} → ${format(to)}` : format(to);
}

const shortDate = (value: string) => formatBusinessDate(value, 'short');

export function BusinessDateHistoryTable({
  entries,
  actorNames,
  timeZone,
}: BusinessDateHistoryTableProps) {
  return (
    // Keyboard-scrollable region: at 375 px the min-width table overflows with no focusable
    // cell of its own, which axe flags as the serious `scrollable-region-focusable` rule.
    <TableContainer tabIndex={0} role="region" aria-label="Business date history">
      <Table aria-label="Business date history" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow>
            <TableCell>Occurred ({timeZone})</TableCell>
            <TableCell>Event</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Business date</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry, index) => {
            const when = formatInstant(entry.occurredAt, timeZone);
            return (
              // History entries have no id on the wire; they're immutable and newest first.
              <TableRow key={`${entry.occurredAt}-${index}`} hover>
                <TableCell>
                  <Typography variant="body2">{when.date}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {when.time}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {historyEventLabel(entry.eventType)}
                  </Typography>
                </TableCell>
                <TableCell>{change(entry.fromStatus, entry.toStatus, humanizeEnum)}</TableCell>
                <TableCell>
                  {change(entry.fromBusinessDate, entry.toBusinessDate, shortDate)}
                </TableCell>
                <TableCell>
                  {entry.actorUserId ? (
                    <TruncatedText
                      value={actorNames.get(entry.actorUserId) ?? shortId(entry.actorUserId)}
                      maxWidth={200}
                    />
                  ) : (
                    'System'
                  )}
                </TableCell>
                <TableCell>
                  {entry.reason ? <TruncatedText value={entry.reason} maxWidth={280} /> : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
