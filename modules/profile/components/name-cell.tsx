import Box from '@mui/material/Box';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/data-display/status-chip';

/** A bold name with an optional "Current" marker, its code underneath; long values wrap. */
export function NameCell({
  name,
  code,
  current = false,
}: {
  name: string;
  code: string;
  current?: boolean;
}) {
  return (
    <TableCell>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        {current && <StatusChip value="CURRENT" label="Current" tone="info" />}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
        {code}
      </Typography>
    </TableCell>
  );
}
