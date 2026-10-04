import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface SectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  children: ReactNode;
}

/** Bordered surface with a header row (prototype `.surface` + `.surface-head`). */
export function SectionCard({
  title,
  description,
  actions,
  headingLevel = 'h2',
  children,
}: SectionCardProps) {
  const headingId = useId();
  return (
    <Paper component="section" aria-labelledby={headingId} sx={{ overflow: 'hidden' }}>
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
          <Typography id={headingId} component={headingLevel} variant="h5">
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
    </Paper>
  );
}
