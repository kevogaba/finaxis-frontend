'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { WorkspaceDrawer } from '@/components/shell/workspace-drawer';
import { MobileNavigationButton } from '@/components/shell/mobile-navigation-button';
import { platformAdministrationModule } from '../platform-administration-module';
import { platformAdministrationNavigationItems } from '../platform-administration-navigation';

// Transitional: Task 4 (PR 04) deletes this shell and moves the drawer into AppShell, which
// gets the collapse preference from a cookie and the footer identity from the resolved
// ApplicationContext. This local state exists only until then.
export function PlatformWorkspaceShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100dvh - 64px)' }}>
      <WorkspaceDrawer
        items={platformAdministrationNavigationItems}
        navigationAriaLabel={platformAdministrationModule.name}
        collapsed={collapsed}
        onToggleCollapsed={() => {
          setCollapsed((prev) => !prev);
        }}
        mobileOpen={mobileOpen}
        onMobileClose={() => {
          setMobileOpen(false);
        }}
        footerTitle={platformAdministrationModule.name}
        footerSubtitle={platformAdministrationModule.description}
      />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar
          variant="dense"
          sx={{
            display: { xs: 'flex', md: 'none' },
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <MobileNavigationButton
            onClick={() => {
              setMobileOpen(true);
            }}
          />
          <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 600 }}>
            {platformAdministrationModule.name}
          </Typography>
        </Toolbar>
        <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
