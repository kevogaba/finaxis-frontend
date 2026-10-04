import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import type { StatusTone } from './status-chip';

/** A count that failed to load: never 0, never blank (index rule 9). */
export const KPI_UNAVAILABLE = "Couldn't be loaded";

/** The icon square's soft tint: each pair is already gated by `theme/tokens.test.ts`. */
const SQUARE: Record<StatusTone, { bgcolor: string; color: string }> = {
  success: { bgcolor: 'status.successBg', color: 'success.main' },
  warning: { bgcolor: 'status.warningBg', color: 'warning.main' },
  error: { bgcolor: 'status.dangerBg', color: 'error.main' },
  info: { bgcolor: 'status.infoBg', color: 'info.main' },
  default: { bgcolor: 'avatar.bg', color: 'avatar.fg' },
};

const NUMBER = new Intl.NumberFormat('en-GB');

interface KpiTileProps {
  /** Unique on the page: names the group (`${id}-label`). */
  id: string;
  label: string;
  /** `null` when the read failed. */
  value: number | null;
  /** The failed read's reference. */
  reference?: string | null;
  caption: string;
  /** Decorative. A Server Component builds it; no MUI prop clones it (AGENTS.md). */
  icon: ReactNode;
  tone?: StatusTone;
  /** A unique accessible name on the page (index rule 12). */
  link?: { href: string; label: string };
}

/** Spec §9's KPI tile, Server-Component safe: a labelled group with its value, caption and link. */
export function KpiTile({
  id,
  label,
  value,
  reference = null,
  caption,
  icon,
  tone = 'default',
  link,
}: KpiTileProps) {
  const labelId = `${id}-label`;
  return (
    <Paper
      role="group"
      aria-labelledby={labelId}
      sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            ...SQUARE[tone],
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography id={labelId} variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      {value === null ? (
        <Box>
          <Typography component="p" variant="body1" sx={{ fontWeight: 700 }}>
            {KPI_UNAVAILABLE}
          </Typography>
          {reference && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
              Reference: {reference}
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          component="p"
          variant="h3"
          sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}
        >
          {NUMBER.format(value)}
        </Typography>
      )}
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        {caption}
      </Typography>
      {link && (
        <Link
          component={NextLink}
          href={link.href}
          variant="body2"
          sx={{ mt: 'auto', fontWeight: 600 }}
        >
          {link.label}
        </Link>
      )}
    </Paper>
  );
}
