import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import Link from '@/components/navigation/next-link';

export default function NotFound() {
  return (
    <Box
      component="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center"
    >
      <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 440 }}>
        <Typography variant="overline" color="text.secondary">
          Error 404
        </Typography>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
          We couldn&apos;t find that page
        </Typography>
        <Typography variant="body1" color="text.secondary">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Head back to the sign-in
          page to continue.
        </Typography>
        <Button component={Link} href="/login" variant="contained" size="large" sx={{ mt: 2 }}>
          Back to sign in
        </Button>
        <Typography variant="body2" color="text.secondary">
          Need help? <MuiLink href="mailto:support@finaxis.io">Contact support</MuiLink>
        </Typography>
      </Stack>
    </Box>
  );
}
