'use client';

import Chip from '@mui/material/Chip';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';

/** Builds the Chip (and its icon) entirely on the client, so no pre-built element crosses the
 * Server -> Client boundary as a prop value (see AGENTS.md). */
export function SignedInChip() {
  return (
    <Chip
      icon={<CheckCircleOutlined />}
      label="Signed in"
      color="success"
      size="small"
      variant="outlined"
    />
  );
}
