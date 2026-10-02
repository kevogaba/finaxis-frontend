import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
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
      <Inventory2Outlined sx={{ fontSize: 34 }} aria-hidden="true" />
      <Typography component="p" variant="h5" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      {description && <Typography variant="body2">{description}</Typography>}
    </Box>
  );
}
