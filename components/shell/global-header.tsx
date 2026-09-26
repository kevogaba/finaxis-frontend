'use client';

import { usePathname } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NextLink from '@/components/navigation/next-link';
import type { FinaxisUser } from '@/auth/auth.types';
import { AppSwitcher } from './app-switcher';
import { ThemeModeMenu } from './theme-mode-menu';
import { UserMenu } from './user-menu';
import { useApplicationContext } from './organization-context';

interface GlobalHeaderProps {
  user: FinaxisUser;
  onOpenNavigation: () => void;
}

/** 68 px app bar (prototype `.topbar`): workspace, context, then global controls. */
export function GlobalHeader({ user, onOpenNavigation }: GlobalHeaderProps) {
  const { module, organization, branch } = useApplicationContext();
  const pathname = usePathname();

  return (
    <AppBar position="sticky">
      <Toolbar disableGutters sx={{ minHeight: 68, height: 68, gap: 3, px: { xs: 2.5, md: 4.5 } }}>
        <IconButton
          aria-label="Open navigation"
          onClick={onOpenNavigation}
          sx={{ display: { md: 'none' } }}
        >
          <MenuOutlined />
        </IconButton>

        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 2.5,
            height: 46,
            px: 3,
            flexShrink: 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'surfaces.secondary',
          }}
        >
          <AppsOutlined fontSize="small" aria-hidden="true" />
          <Typography variant="subtitle2" component="span" noWrap sx={{ fontWeight: 700 }}>
            {module.name}
          </Typography>
        </Box>

        <Button
          component={NextLink}
          href={`/select-context?next=${encodeURIComponent(pathname)}`}
          color="inherit"
          aria-label={`Switch organisation or branch. Current: ${organization.name}, ${branch.name}`}
          sx={{ minWidth: 0, height: 46, gap: 2.5, px: 2, color: 'text.primary' }}
        >
          <DomainOutlined aria-hidden="true" />
          <Box
            component="span"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              flexDirection: 'column',
              alignItems: 'flex-start',
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            <Typography
              component="span"
              variant="subtitle2"
              noWrap
              sx={{ fontWeight: 700, maxWidth: { sm: 160, lg: 260 } }}
            >
              {organization.name}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ maxWidth: { sm: 160, lg: 260 } }}
            >
              {branch.name}
            </Typography>
          </Box>
          <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <AppSwitcher />
          <ThemeModeMenu />
          <UserMenu user={user} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
