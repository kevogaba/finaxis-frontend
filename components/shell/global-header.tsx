'use client';

import type { ReactNode } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import type { FinaxisUser } from '@/auth/auth.types';
import { AppSwitcher } from './app-switcher';
import { ThemeModeMenu } from './theme-mode-menu';
import { UserMenu } from './user-menu';
import { useApplicationContext } from './organization-context';

interface GlobalHeaderProps {
  user: FinaxisUser;
  platformOrganisationId: string;
  onOpenNavigation: () => void;
  onOpenContextSwitcher: () => void;
  /** App-bar business date chip (spec §8); absent when the workspace or permission excludes it. */
  businessDate?: ReactNode;
  /** Workspace-specific notifications slot (spec §8), populated by later PRs. */
  notifications?: ReactNode;
}

/** 68 px app bar (prototype `.topbar`): workspace, context, then global controls. */
export function GlobalHeader({
  user,
  platformOrganisationId,
  onOpenNavigation,
  onOpenContextSwitcher,
  businessDate,
  notifications,
}: GlobalHeaderProps) {
  const { module, organization, branch } = useApplicationContext();

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

        <AppSwitcher
          trigger="label"
          moduleName={module.name}
          currentModuleId={module.id}
          platformOrganisationId={platformOrganisationId}
          onOpenContextSwitcher={onOpenContextSwitcher}
        />

        <Button
          onClick={onOpenContextSwitcher}
          aria-haspopup="dialog"
          color="inherit"
          aria-label={`Switch organisation or branch. Current: ${organization.name}, ${branch?.name ?? 'All branches'}`}
          sx={{ minWidth: 0, height: 46, gap: 2.5, px: 2, color: 'text.primary' }}
        >
          <DomainOutlined aria-hidden="true" />
          <Box
            component="span"
            sx={{
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              alignItems: 'flex-start',
              minWidth: 0,
              maxWidth: { md: 160, lg: 260 },
              textAlign: 'left',
            }}
          >
            <Typography
              component="span"
              variant="subtitle2"
              noWrap
              sx={{ fontWeight: 700, maxWidth: '100%' }}
            >
              {organization.name}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              noWrap
              sx={{ color: 'text.secondary', maxWidth: '100%' }}
            >
              {branch?.name ?? 'All branches'}
            </Typography>
          </Box>
          <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        {/* Hides below `lg`. Above it, the chip's own label ellipsizes the date/"Business date"
            prefix first and keeps the status word (Open/Closing/Closed) fully visible — see
            business-date-chip.tsx (layer-07 visual pass, WCAG 1.4.1). */}
        {businessDate && (
          <Box sx={{ display: { xs: 'none', lg: 'flex' }, minWidth: 0 }}>{businessDate}</Box>
        )}

        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <AppSwitcher
            trigger="icon"
            currentModuleId={module.id}
            platformOrganisationId={platformOrganisationId}
            onOpenContextSwitcher={onOpenContextSwitcher}
          />
          {notifications}
          <ThemeModeMenu />
          <UserMenu user={user} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
