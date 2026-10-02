'use client';

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import type { ReactNode } from 'react';
import { useListNavigationPending } from './use-list-navigation';

/**
 * A thin progress bar pinned to the top of its (`position: relative`) ancestor, visible whenever
 * a `useListNavigation()` push under the nearest `ListNavigationProvider` is in flight. Renders
 * nothing with no provider or while idle.
 */
export function ListNavigationProgress() {
  const pending = useListNavigationPending();
  if (!pending) return null;
  return (
    <LinearProgress
      aria-label="Loading"
      sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
    />
  );
}

/** Marks its children as busy (`aria-busy`) while a list navigation is in flight. */
export function ListBusyRegion({ children }: { children: ReactNode }) {
  const pending = useListNavigationPending();
  return <Box aria-busy={pending}>{children}</Box>;
}
