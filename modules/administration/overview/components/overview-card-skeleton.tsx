import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { SectionCard } from '@/components/data-display/section-card';

/** A card's Suspense fallback (spec §6.3): its title at once, its body marked busy until the card's
 * own reads stream in. The theme's reduced-motion rule stills the pulse. */
export function OverviewCardSkeleton({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <Box aria-busy="true" sx={{ px: 4, py: 3.5 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="85%" />
        <Skeleton variant="text" width="40%" />
      </Box>
    </SectionCard>
  );
}
