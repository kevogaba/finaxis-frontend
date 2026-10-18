import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { SectionCard } from '@/components/data-display/section-card';

/** A card's Suspense fallback (spec §6.3): its title and static description at once, so the header
 * doesn't move when the card fills; then `rows` placeholders about the height of the card's own
 * rows (59 px, with the same divider rules), and `bar` adds Readiness's bar block above them. The
 * body is marked busy until the card's own reads stream in, and a visually hidden "Loading…" tells
 * a screen reader (`aria-busy` alone isn't announced). The theme's reduced-motion rule stills the
 * pulse. */
export function OverviewCardSkeleton({
  title,
  description,
  rows,
  bar = false,
}: {
  title: string;
  description: string;
  rows: number;
  bar?: boolean;
}) {
  return (
    <SectionCard title={title} description={description}>
      <Box aria-busy="true">
        <span className="sr-only">Loading…</span>
        {bar && (
          <Box sx={{ px: 4, pt: 3.5, pb: 3 }}>
            <Box sx={{ typography: 'body2', fontWeight: 700, mb: 1.5 }}>
              <Skeleton variant="text" width="40%" />
            </Box>
            <Skeleton variant="rectangular" height={4} />
          </Box>
        )}
        {Array.from({ length: rows }, (_row, index) => (
          <Box
            key={index}
            sx={{ px: 4, py: 2.5, borderTop: bar || index > 0 ? 1 : 0, borderColor: 'divider' }}
          >
            <Box sx={{ typography: 'body1', fontWeight: 700 }}>
              <Skeleton variant="text" width="45%" />
            </Box>
            <Box sx={{ typography: 'body2' }}>
              <Skeleton variant="text" width="30%" />
            </Box>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
