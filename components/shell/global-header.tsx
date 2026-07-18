'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import type { FinaxisUser } from '@/auth/auth.types';
import { AppSwitcher } from './app-switcher';
import { ThemeModeMenu } from './theme-mode-menu';
import { NotificationButton } from './notification-button';
import { UserMenu } from './user-menu';
import { useApplicationContext } from './organization-context';

interface GlobalHeaderProps {
  user: FinaxisUser;
}

export function GlobalHeader({ user }: GlobalHeaderProps) {
  const { module, organization, branch } = useApplicationContext();

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar sx={{ minHeight: 64, gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <FinaxisLogo size={32} />
        </Stack>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {module.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {organization.name} · {branch.name}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ThemeModeMenu />
          <NotificationButton />
          <AppSwitcher />
          <UserMenu user={user} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
