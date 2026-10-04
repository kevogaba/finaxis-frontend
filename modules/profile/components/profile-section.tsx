import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';

interface ProfileSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A profile tab's surface (prototype `.surface` + `.surface-head`): an MUI Card named by its h2.
 * ponytail: SectionCard's props minus `headingLevel` — PR 07's SectionCard isn't at this layer's
 * base (F_07b); once 07 integrates, swapping the import is the whole change.
 */
export function ProfileSection({ title, description, actions, children }: ProfileSectionProps) {
  const headingId = useId();
  return (
    <Card component="section" aria-labelledby={headingId}>
      <Box
        sx={{
          minHeight: 56,
          px: 4,
          py: 3.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={headingId} component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{actions}</Box>}
      </Box>
      {children}
    </Card>
  );
}
