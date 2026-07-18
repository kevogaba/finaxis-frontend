'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { WorkspaceDrawer } from '@/components/shell/workspace-drawer';
import { MobileNavigationButton } from '@/components/shell/mobile-navigation-button';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';

export default function AdministrationLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100dvh - 64px)' }}>
      <WorkspaceDrawer
        items={administrationNavigationItems}
        mobileOpen={mobileOpen}
        onMobileClose={() => {
          setMobileOpen(false);
        }}
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
