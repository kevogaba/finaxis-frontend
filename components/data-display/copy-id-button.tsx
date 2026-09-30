'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { useToast } from '@/components/providers/toast-provider';
import { shortId } from '@/lib/format';

interface CopyIdButtonProps {
  value: string;
  /** Names the copy control and the toast, e.g. `Branch ID`. */
  label?: string;
}

/** A shortened ID with a copy affordance (spec §9); the full value stays in `title`. */
export function CopyIdButton({ value, label = 'ID' }: CopyIdButtonProps) {
  const notify = useToast();
  // The toast tells the user to select and copy the value themselves, so the full value (not just
  // the shortened one normally shown) has to actually be on screen for that to be true.
  const [revealed, setRevealed] = useState(false);

  const copy = async () => {
    try {
      // Throws too where the Clipboard API is missing (an insecure origin).
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`);
    } catch {
      setRevealed(true);
      notify(`Couldn't copy the ${label}. Select it below and copy it instead.`, 'error');
    }
  };

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Typography component="span" variant="body2" title={value} sx={{ fontFamily: 'monospace' }}>
        {revealed ? value : shortId(value)}
      </Typography>
      <Tooltip title={`Copy ${label}`}>
        <IconButton
          size="small"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void copy();
          }}
        >
          <ContentCopyOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
