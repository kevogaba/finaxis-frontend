import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { SectionCard } from '@/components/data-display/section-card';
import { CARD_LOADING } from '../overview-rules';

/** A card's Suspense fallback (spec §6.3): its title, its static description and a placeholder of
 * its header link's words at once, then the body in the card's own shape: `date` (Business date's
 * one line), `readiness` (the bar block, then five items each with its link line) or `rows` (the
 * card's list rows, with the same divider rules). The placeholders approximate the card's heights;
 * they don't match them exactly, since a card's rows depend on its data. The body is marked busy
 * until the card's reads stream in, and a visually hidden "Loading…" just before it tells a screen
 * reader (`aria-busy` alone isn't announced). The theme's reduced-motion rule stills the pulse. */
export function OverviewCardSkeleton({
  title,
  description,
  action,
  shape = 'rows',
  rows = 0,
}: {
  title: string;
  description: string;
  /** The header link's words: a placeholder of their size, so the header wraps where the card's does. */
  action?: string;
  shape?: 'rows' | 'date' | 'readiness';
  rows?: number;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        action ? (
          <Box sx={{ typography: 'body2', fontWeight: 600 }}>
            <Skeleton variant="text">
              <span>{action}</span>
            </Skeleton>
          </Box>
        ) : undefined
      }
    >
      <span className="sr-only">{CARD_LOADING}</span>
      <Box aria-busy="true">
        {shape === 'date' && (
          <Box sx={{ px: 4, py: 3.5, typography: 'h4' }}>
            <Skeleton variant="text" width="70%" />
          </Box>
        )}
        {shape === 'readiness' && (
          <Box sx={{ px: 4, pt: 3.5, pb: 3 }}>
            <Box sx={{ typography: 'body2', mb: 1.5 }}>
              <Skeleton variant="text" width="40%" />
            </Box>
            <Skeleton variant="rectangular" height={8} />
          </Box>
        )}
        {Array.from({ length: rows }, (_row, index) => (
          <Box
            key={index}
            sx={{
              px: 4,
              py: 2.5,
              borderTop: shape === 'readiness' || index > 0 ? 1 : 0,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ typography: 'body1' }}>
              <Skeleton variant="text" width="45%" />
            </Box>
            <Box sx={{ typography: 'body2' }}>
              <Skeleton variant="text" width="30%" />
            </Box>
            {shape === 'readiness' && (
              <Box sx={{ typography: 'body2', mt: 0.5 }}>
                <Skeleton variant="text" width="25%" />
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
