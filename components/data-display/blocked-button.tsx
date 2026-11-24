import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface BlockedButtonProps {
  label: string;
  /** Why it can't be used here: visible text, since a disabled button can't take focus to reveal
   * a tooltip. */
  reason: string;
  startIcon?: ReactNode;
}

/** An action the holder's codes offer but that can't be taken here (spec §6.6: shown disabled,
 * not hidden), with its reason under it. Server-Component-safe. */
export function BlockedButton({ label, reason, startIcon }: BlockedButtonProps) {
  const reasonId = useId();
  return (
    <Box sx={{ display: 'inline-grid', justifyItems: 'end', gap: 0.5, maxWidth: 280 }}>
      <Button variant="contained" startIcon={startIcon} disabled aria-describedby={reasonId}>
        {label}
      </Button>
      <Typography
        id={reasonId}
        variant="caption"
        sx={{ color: 'text.secondary', textAlign: 'right', textWrap: 'pretty' }}
      >
        {reason}
      </Typography>
    </Box>
  );
}
