'use client';

import Chip from '@mui/material/Chip';
import EventOutlined from '@mui/icons-material/EventOutlined';
import NextLink from '@/components/navigation/next-link';
import type { StatusTone } from '@/components/data-display/status-chip';

/** Builds the Chip (and its icon) entirely on the client, so no pre-built element crosses the
 * Server -> Client boundary as a prop value (see AGENTS.md). */
export function BusinessDateChip({ label, color }: { label: string; color: StatusTone }) {
  return (
    <Chip
      component={NextLink}
      href="/admin/business-date"
      clickable
      size="small"
      variant="soft"
      color={color}
      icon={<EventOutlined />}
      label={label}
      // Ellipsizes the label before the header itself overflows (the app-bar slot hides below
      // `lg`). ponytail: the prototype's icon-only band (≤ 1180 px) is deferred to the visual
      // pass.
      sx={{ maxWidth: '100%' }}
    />
  );
}
