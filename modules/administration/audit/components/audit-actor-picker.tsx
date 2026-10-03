'use client';

import Box from '@mui/material/Box';
import { useListNavigation } from '@/components/data-display/use-list-navigation';
import { UserPicker } from '@/modules/administration/users/components/user-picker';

/** Spec §10.1: the actor filter by user search (the first 10 matches). Choosing a user filters by
 * `actorId` and returns to the first page; the toolbar's chip shows and removes the filter. */
export function AuditActorPicker() {
  const navigate = useListNavigation();
  return (
    <Box sx={{ width: { xs: '100%', sm: 260 } }}>
      <UserPicker
        name="actorSearch"
        label="Actor"
        onChange={(chosen) => {
          if (!chosen) return;
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
