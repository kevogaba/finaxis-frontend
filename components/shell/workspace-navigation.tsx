'use client';

import type { ElementType } from 'react';
import { usePathname } from 'next/navigation';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import NextLink from '@/components/navigation/next-link';

export interface WorkspaceNavigationItem {
  href: string;
  label: string;
  icon: ElementType;
}

interface WorkspaceNavigationProps {
  items: readonly WorkspaceNavigationItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function WorkspaceNavigation({ items, collapsed, onNavigate }: WorkspaceNavigationProps) {
  const pathname = usePathname();

  return (
    <List component="nav" aria-label="Administration" sx={{ px: 1 }}>
      {items.map((item) => {
        const isActive = pathname === item.href;
        const button = (
          <ListItemButton
            key={item.href}
            component={NextLink}
            href={item.href}
            selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            sx={{ borderRadius: 1, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
              <item.icon fontSize="small" />
            </ListItemIcon>
            {!collapsed && <ListItemText primary={item.label} />}
          </ListItemButton>
        );

        return collapsed ? (
          <Tooltip key={item.href} title={item.label} placement="right">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </List>
  );
}
