'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import EventOutlined from '@mui/icons-material/EventOutlined';
import NextLink from '@/components/navigation/next-link';
import type { StatusTone } from '@/components/data-display/status-chip';

interface BusinessDateChipProps {
  /** "Mon, 7 Sep 2026 · Business date" — may ellipsize under width pressure. */
  dateLabel: string;
  /** "Open" / "Closing" / "Closed" — must stay readable; colour alone can't carry it (WCAG 1.4.1). */
  statusLabel: string;
  color: StatusTone;
}

/** Builds the Chip (and its icon) entirely on the client, so no pre-built element crosses the
 * Server -> Client boundary as a prop value (see AGENTS.md). */
export function BusinessDateChip({ dateLabel, statusLabel, color }: BusinessDateChipProps) {
  return (
    <Chip
      component={NextLink}
      href="/admin/business-date"
      clickable
      size="small"
      variant="soft"
      color={color}
      icon={<EventOutlined />}
      // Explicit: the visible label is split across two flex spans for truncation (below), and the
      // accessible-name algorithm trims whitespace at each node's own edges when it concatenates
      // sibling text, which silently swallows the space between them. Stating the name directly
      // keeps it exactly "<date> · Business date · <status>" regardless of that layout.
      aria-label={`${dateLabel} · ${statusLabel}`}
      label={
        <>
          <Box
            component="span"
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {`${dateLabel} ·`}
          </Box>
          <Box component="span" sx={{ flexShrink: 0 }}>
            {statusLabel}
          </Box>
        </>
      }
      // The label becomes a flex row so the date/"Business date" prefix ellipsizes on its own
      // (minWidth: 0) while the status word stays pinned at its intrinsic width and is never the
      // part that truncates — the layer-07 visual pass found the plain-string label losing
      // Open/Closing/Closed first at common widths (1280/1366), leaving colour as the only signal
      // (WCAG 1.4.1). An icon-only band (the option this replaces) would have the same defect: one
      // Chip colour with no status text. The gap between the two spans comes from `columnGap`, not
      // a trailing space character in the first span's text (M04): a browser collapses trailing
      // whitespace at a flex item's own edge, so "· " read as "·" with nothing after it.
      slotProps={{
        label: { sx: { display: 'flex', alignItems: 'center', minWidth: 0, columnGap: '0.25em' } },
      }}
      sx={{ maxWidth: '100%' }}
    />
  );
}
