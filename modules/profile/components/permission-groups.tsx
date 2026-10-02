import { useId } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { PermissionGroup } from '../profile-rules';

/**
 * Effective permission codes grouped by prefix (lane ownership: 15). Bounded by the catalogue
 * (80 codes), so no paging; each group is a list named by its h3.
 */
export function PermissionGroups({ groups }: { groups: readonly PermissionGroup[] }) {
  const baseId = useId();
  return (
    <Box
      sx={{
        px: 4,
        py: 3.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 3.5,
      }}
    >
      {groups.map((group, index) => {
        const headingId = `${baseId}-${String(index)}`;
        return (
          <Box key={group.prefix} sx={{ minWidth: 0 }}>
            <Typography id={headingId} component="h3" variant="subtitle2" sx={{ mb: 1.5 }}>
              {group.label}
            </Typography>
            <Box
              component="ul"
              aria-labelledby={headingId}
              sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}
            >
              {group.codes.map((code) => (
                <Box component="li" key={code} sx={{ maxWidth: '100%' }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={code}
                    sx={{ maxWidth: '100%', fontFamily: 'monospace' }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
