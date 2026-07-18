import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

interface PlaceholderSectionProps {
  label: string;
  emptyStateMessage: string;
}

export function PlaceholderSection({ label, emptyStateMessage }: PlaceholderSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <InfoOutlined color="disabled" fontSize="large" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {label} isn&apos;t available yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptyStateMessage}
        </Typography>
      </Stack>
    </Paper>
  );
}
