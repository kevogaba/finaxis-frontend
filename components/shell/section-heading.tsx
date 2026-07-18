import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import MuiLink from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

interface SectionHeadingProps {
  parentLabel: string;
  parentHref: string;
  label: string;
  description: string;
}

export function SectionHeading({
  parentLabel,
  parentHref,
  label,
  description,
}: SectionHeadingProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
        <MuiLink component={NextLink} href={parentHref} underline="hover" color="text.secondary">
          {parentLabel}
        </MuiLink>
        <Typography color="text.primary">{label}</Typography>
      </Breadcrumbs>
      <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        {description}
      </Typography>
    </Box>
  );
}
