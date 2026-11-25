import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  /** e.g. a switch-context button. */
  action?: ReactNode;
}

/**
 * Inline "no permission" or "wrong context" state (spec §6.7), shown in place of the content —
 * never an error page. For approve/activate, pass the maker-checker explanation.
 */
export function ForbiddenState({
  title = "You don't have permission",
  description = "Your role doesn't include this in the current context. Ask an administrator if you need access.",
  action,
}: ForbiddenStateProps) {
  return (
    <Box
      sx={{
        minHeight: 240,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        p: 6,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <LockOutlined sx={{ fontSize: 34 }} aria-hidden="true" />
      <Typography component="p" variant="h5" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 480 }}>
        {description}
      </Typography>
      {action}
    </Box>
  );
}
