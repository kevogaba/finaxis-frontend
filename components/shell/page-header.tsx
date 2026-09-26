import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page heading (prototype `.page-heading`): eyebrow, the page's only h1, description, and
 * right-aligned actions. Server-Component-safe — pass actions as elements, never callbacks.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: 5,
        mb: 5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" component="p" color="text.secondary">
            {eyebrow}
          </Typography>
        )}
        <Typography component="h1" variant="h1" sx={{ mt: 1, mb: 1.25 }}>
          {title}
        </Typography>
        {description && (
          <Typography color="text.secondary" sx={{ maxWidth: 730 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  );
}
