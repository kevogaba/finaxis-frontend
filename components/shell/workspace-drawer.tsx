'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import { WorkspaceNavigation, type WorkspaceNavigationItem } from './workspace-navigation';

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 72;

interface WorkspaceDrawerProps {
  items: readonly WorkspaceNavigationItem[];
  navigationAriaLabel?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function WorkspaceDrawer({
  items,
  navigationAriaLabel,
  mobileOpen,
  onMobileClose,
}: WorkspaceDrawerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width,
          flexShrink: 0,
          transition: (theme) =>
            theme.transitions.create('width', { duration: theme.transitions.duration.short }),
          '& .MuiDrawer-paper': {
            width,
            boxSizing: 'border-box',
            position: 'sticky',
            top: 64,
            height: 'calc(100dvh - 64px)',
            transition: (theme) =>
              theme.transitions.create('width', { duration: theme.transitions.duration.short }),
            overflowX: 'hidden',
          },
        }}
      >
        <WorkspaceNavigation items={items} ariaLabel={navigationAriaLabel} collapsed={collapsed} />
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 1,
          }}
        >
          <Tooltip title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <IconButton
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              onClick={() => {
                setCollapsed((prev) => !prev);
              }}
              size="small"
            >
              {collapsed ? (
                <ChevronRightOutlined fontSize="small" />
              ) : (
                <ChevronLeftOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: EXPANDED_WIDTH },
        }}
      >
        <WorkspaceNavigation
          items={items}
          ariaLabel={navigationAriaLabel}
          onNavigate={onMobileClose}
        />
      </Drawer>
    </>
  );
}
