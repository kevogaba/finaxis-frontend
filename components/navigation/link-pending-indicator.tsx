'use client';

import { useLinkStatus } from 'next/link';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Marks a server-built `next/link` navigation (a Link whose `href` a Server Component computed,
 * so it can't route through `useListNavigation()`) as in flight. Must be rendered as a child of
 * the `Link`/`NextLink` it decorates — `useLinkStatus`'s contract. Decorative only: `aria-hidden`
 * keeps the link's own accessible name (an `aria-label` or its visible text) unchanged.
 */
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <CircularProgress
      size={12}
      thickness={6}
      aria-hidden
      sx={{ ml: 0.75, verticalAlign: 'middle' }}
    />
  );
}
