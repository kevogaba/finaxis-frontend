import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface DescriptionItem {
  label: string;
  value: ReactNode;
}

interface DescriptionListProps {
  items: readonly DescriptionItem[];
  columns?: 1 | 2;
}

/** Label/value grid (prototype `.description-list`), two columns from `md` by default. */
export function DescriptionList({ items, columns = 2 }: DescriptionListProps) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        px: 4.5,
        pb: 4.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: columns === 2 ? '1fr 1fr' : '1fr' },
        columnGap: 7,
      }}
    >
      {items.map((item) => (
        <Box
          key={item.label}
          sx={{
            minHeight: 51,
            py: 2.75,
            display: 'grid',
            gridTemplateColumns: 'minmax(105px, 0.75fr) 1.25fr',
            alignItems: 'start',
            gap: 3,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography component="dt" variant="body2" color="text.secondary">
            {item.label}
          </Typography>
          <Typography
            component="dd"
            variant="body1"
            sx={{ m: 0, fontWeight: 650, overflowWrap: 'anywhere' }}
          >
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
