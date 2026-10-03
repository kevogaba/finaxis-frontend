'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Catches errors thrown below the root layout — including the authenticated layout — such as a
 * backend outage or a response that no longer matches the contract. Shows only the digest as a
 * support reference; server error messages are never rendered.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Box
      component="main"
      className="flex min-h-dvh items-center justify-center p-4"
      sx={{ bgcolor: 'background.default' }}
    >
      <Paper sx={{ maxWidth: 520, width: '100%', p: { xs: 6, sm: 8 } }}>
        <Stack spacing={3}>
          <Typography component="h1" variant="h3">
            Something went wrong
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            We couldn&apos;t load this page. Try again, or sign in again if the problem continues.
          </Typography>
          {error.digest && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Reference: {error.digest}
            </Typography>
          )}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={retry}>
              Try again
            </Button>
            <Button variant="outlined" href="/login">
              Back to sign in
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
