import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        minHeight: 64,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: { xs: 'center', md: 'space-between' },
        gap: 3,
        px: { xs: 3.5, md: 6 },
        py: 3,
        color: 'text.secondary',
        textAlign: { xs: 'center', md: 'left' },
      }}
    >
      <Typography variant="caption">
        © {new Date().getFullYear()} Finaxis. Open for a stronger cooperative tomorrow.
      </Typography>
      <Typography variant="caption">Built for African cooperatives</Typography>
    </Box>
  );
}
