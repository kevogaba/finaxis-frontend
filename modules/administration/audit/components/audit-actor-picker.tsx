'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { useListNavigation } from '@/components/data-display/use-list-navigation';
import { UserPicker } from '@/modules/administration/users/components/user-picker';

interface AuditActorPickerProps {
  /** The actor filter now applied. When it changes the search starts over, empty. */
  actorId?: string;
}

/** Spec §10.1: the actor filter by user search (the first 10 matches). Choosing a user filters by
 * `actorId` and returns to the first page; the toolbar's chip shows and removes the filter.
 *
 * The search restarts (a fresh `UserPicker`, keyed on the applied actor) each time the filter
 * changes, which replaces the focused input. After this picker's OWN choice, focus goes back to the
 * new input once the filter lands, as the toolbar's own search keeps its focus; a filter that
 * changed any other way (Back, a chip removed), or after the user moved on, never takes it. The
 * request names the actor it was made for, so a pick whose navigation never landed (superseded)
 * can't take focus for a later, unrelated change. */
export function AuditActorPicker({ actorId }: AuditActorPickerProps) {
  const navigate = useListNavigation();
  const box = useRef<HTMLDivElement>(null);
  // The actor this picker's own choice asked for; consumed by the next change of the applied filter.
  const refocusFor = useRef<string | null>(null);
  // Re-picking the applied actor changes no URL, so the stale name is cleared by bumping this.
  const [resets, setResets] = useState(0);

  useEffect(() => {
    const wanted = refocusFor.current;
    refocusFor.current = null;
    // Not our pick landing (Back, a chip removed, or a superseded pick's actor): nothing to restore.
    if (wanted === null || wanted !== actorId) return;
    // Focus left the replaced input for <body>; if it is anywhere else, the user moved it.
    const active = document.activeElement;
    if (active && active !== document.body && !box.current?.contains(active)) return;
    box.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
  }, [actorId, resets]);

  return (
    <Box ref={box} sx={{ width: { xs: '100%', sm: 260 } }}>
      <UserPicker
        key={`${actorId ?? 'none'}:${resets}`}
        name="actorSearch"
        label="Actor"
        onChange={(chosen) => {
          if (!chosen) return;
          refocusFor.current = chosen.id;
          if (chosen.id === actorId) {
            setResets((count) => count + 1);
            return;
          }
          navigate((params) => {
            params.set('actorId', chosen.id);
            params.delete('page');
            params.delete('event');
          });
        }}
      />
    </Box>
  );
}
