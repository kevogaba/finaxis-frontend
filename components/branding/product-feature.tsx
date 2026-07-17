import type SvgIcon from '@mui/material/SvgIcon';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface ProductFeatureProps {
  icon: typeof SvgIcon;
  label: string;
}

/**
 * A single restrained capability badge shown on the login brand panel
 * (e.g. "Membership", "Savings"). Icon + label only — no descriptions.
 *
 * Uses plain-object `sx` with dotted palette-path strings (e.g. "brand.onNavy")
 * rather than `sx={(theme) => ...}` callbacks — this stays a Server Component,
 * and function props can't be passed from a Server Component into MUI's
 * Client Components.
 */
export function ProductFeature({ icon: Icon, label }: ProductFeatureProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: 'center',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'brand.onNavyBorder',
        bgcolor: 'brand.onNavySurface',
        px: 3,
        py: 2,
      }}
    >
      <Icon aria-hidden="true" fontSize="small" sx={{ color: 'brand.onNavyMuted' }} />
      <Typography variant="body2" sx={{ color: 'brand.onNavy', fontWeight: 500 }}>
        {label}
      </Typography>
    </Stack>
  );
}
