import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

export default function Loading() {
  return (
    <Box
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-3"
      aria-live="polite"
    >
      <CircularProgress aria-hidden="true" />
      <Typography variant="body2" color="text.secondary">
        Loading…
      </Typography>
    </Box>
  );
}
