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
  /** Shown when the user holds any of these permission codes; omit for always-visible items. */
  requiresAny?: readonly string[];
}

export function visibleNavigationItems(
  items: readonly WorkspaceNavigationItem[],
  permissions: readonly string[],
): WorkspaceNavigationItem[] {
  return items.filter(
    (item) => !item.requiresAny || item.requiresAny.some((code) => permissions.includes(code)),
  );
}

export function isNavigationItemActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }

  const hrefSegments = href.split('/').filter(Boolean);
  if (href === '/' || hrefSegments.length <= 1) {
    return false;
  }

  return pathname.startsWith(`${href}/`);
}

interface WorkspaceNavigationProps {
  items: readonly WorkspaceNavigationItem[];
  ariaLabel: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Rail navigation on the navy brand surface (prototype `.sidebar nav`). */
export function WorkspaceNavigation({
  items,
  ariaLabel,
  collapsed = false,
  onNavigate,
}: WorkspaceNavigationProps) {
  const pathname = usePathname();

  return (
    <List component="nav" aria-label={ariaLabel} sx={{ flex: 1, overflowY: 'auto', py: 3 }}>
      {items.map((item) => {
        const isActive = isNavigationItemActive(pathname, item.href);
        const button = (
          <ListItemButton
            key={item.href}
            component={NextLink}
            href={item.href}
            selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            sx={(theme) => ({
              height: collapsed ? 56 : 54,
              mx: collapsed ? 2.5 : 0,
              my: collapsed ? 1 : 0,
              px: collapsed ? 0 : 5.5,
              gap: 3.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: collapsed ? '7px' : 0,
              borderLeft: collapsed ? 0 : '3px solid transparent',
              color: theme.vars.palette.brand.onNavyMuted,
              '&:hover': {
                backgroundColor: theme.vars.palette.brand.onNavySurface,
                color: theme.vars.palette.brand.onNavy,
              },
              '&.Mui-selected, &.Mui-selected:hover': {
                color: theme.vars.palette.brand.onNavy,
                backgroundColor: 'transparent',
                backgroundImage: theme.vars.palette.brand.railActive,
                borderLeftColor: theme.vars.palette.brand.railMarker,
                boxShadow: collapsed
                  ? `inset 3px 0 ${theme.vars.palette.brand.railMarker}`
                  : 'none',
              },
              '&.Mui-focusVisible': {
                // Ruling (layer 04 pre-flight scan): railMarker inset on the railActive fill is
                // ~2.9:1, below the 3:1 non-text minimum (WCAG 1.4.11) — onNavy is ~6.7:1 on every
                // rail surface.
                outline: `2px solid ${theme.vars.palette.brand.onNavy}`,
                outlineOffset: -2,
              },
            })}
          >
            <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
              <item.icon sx={{ fontSize: 22 }} />
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: {
                    noWrap: true,
                    sx: { fontSize: '0.875rem', fontWeight: isActive ? 700 : 500 },
                  },
                }}
              />
            )}
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
