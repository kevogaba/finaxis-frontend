import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';

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
    <Box sx={{ width: '100%' }}>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          {breadcrumbs.map((crumb) =>
            crumb.href ? (
              <Link key={crumb.href} component={NextLink} href={crumb.href} underline="hover">
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} sx={{ color: 'text.primary' }}>
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <PageHeader eyebrow="Platform administration" title={title} description={description} />
      {children}
    </Box>
  );
}
