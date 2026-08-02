import Breadcrumbs from '@mui/material/Breadcrumbs';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

interface Crumb {
  label: string;
  href?: string;
}

interface PlatformPageShellProps {
  title: string;
  description: string;
  breadcrumbs?: readonly Crumb[];
  children: React.ReactNode;
}

export function PlatformPageShell({
  title,
  description,
  breadcrumbs = [],
  children,
}: PlatformPageShellProps) {
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', width: '100%' }}>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          {breadcrumbs.map((crumb) =>
            crumb.href ? (
              <Link key={crumb.href} component={NextLink} href={crumb.href} underline="hover">
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} color="text.primary">
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 3, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 750 }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            {description}
          </Typography>
        </Box>
        <Chip
          label="Read-only stage"
          color="info"
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
        />
      </Stack>
      {children}
    </Box>
  );
}
