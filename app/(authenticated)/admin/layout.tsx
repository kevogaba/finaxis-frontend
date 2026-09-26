'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { WorkspaceDrawer } from '@/components/shell/workspace-drawer';
import { MobileNavigationButton } from '@/components/shell/mobile-navigation-button';
import { administrationModule } from '@/modules/administration/administration-module';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';

// Transitional: Task 4 (PR 04) deletes this layout and moves the drawer into AppShell, which
// gets the collapse preference from a cookie and the footer identity from the resolved
// ApplicationContext. This local state and the module copy below exist only until then.
export default function AdministrationLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100dvh - 64px)' }}>
      <WorkspaceDrawer
        items={administrationNavigationItems}
        navigationAriaLabel="Administration"
        collapsed={collapsed}
        onToggleCollapsed={() => {
          setCollapsed((prev) => !prev);
        }}
        mobileOpen={mobileOpen}
        onMobileClose={() => {
          setMobileOpen(false);
        }}
        footerTitle={administrationModule.name}
        footerSubtitle={administrationModule.description}
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
            Administration
          </Typography>
        </Toolbar>
        <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
