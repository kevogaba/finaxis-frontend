'use client';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useListNavigation } from '@/components/data-display/use-list-navigation';

interface AuditViewToggleProps {
  views: readonly { value: string; label: string }[];
  value: string;
}

/** Spec §10.1: one subject's history spans several entity types, so record Audit tabs switch
 * between paginated views (`view` in the URL; a new view starts on page 1). */
export function AuditViewToggle({ views, value }: AuditViewToggleProps) {
  const navigate = useListNavigation();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label="Audit view"
      sx={{
        // Wraps instead of overflowing at 375 px; no scroll container, which would clip focus
        // rings. MUI's merged-group look (no left border, square inner corners, -1px overlap) is
        // assigned by child position, not by visual row, so the button that starts a wrapped row
        // still gets it and reads as broken. `&&` beats that rule's specificity regardless of
        // stylesheet order (the same trick this theme already uses, e.g. DialogContent's `&&`).
        flexWrap: 'wrap',
        gap: 1,
        '&& .MuiToggleButtonGroup-grouped': {
          margin: 0,
          borderLeft: 1,
          borderColor: 'divider',
          borderRadius: 1,
        },
      }}
      onChange={(_event, next: string | null) => {
        if (next === null || next === value) return;
        navigate((params) => {
          params.set('view', next);
          params.delete('page');
        });
      }}
    >
      {views.map((view) => (
        <ToggleButton key={view.value} value={view.value}>
          {view.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
