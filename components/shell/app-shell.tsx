'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';
import { platformAdministrationNavigationItems } from '@/modules/platform-administration/platform-administration-navigation';
import { AppFooter } from './app-footer';
import { GlobalHeader } from './global-header';
import { writeNavCollapsed } from './navigation-preferences';
import { ApplicationContextProvider } from './organization-context';
import { WorkspaceDrawer } from './workspace-drawer';
import { visibleNavigationItems } from './workspace-navigation';

const NAVIGATION = {
  administration: administrationNavigationItems,
  'platform-administration': platformAdministrationNavigationItems,
} as const;

interface AppShellProps {
  user: FinaxisUser;
  context: ApplicationContext;
  initialNavCollapsed: boolean;
  children: ReactNode;
}

/**
 * Global authenticated shell. Navigation registries are imported here (client side) because nav
 * items carry icon components, which cannot cross the Server → Client boundary.
 */
export function AppShell({ user, context, initialNavCollapsed, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(initialNavCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Safe on the server: matchMedia is unavailable there, so this starts (and stays, until
  // hydration) false — matching `mobileOpen`'s own initial value.
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  // Widening past `md` with the mobile drawer still open would otherwise leave the temporary
  // Drawer's Modal open (body scroll locked, rest of the app `aria-hidden`) even though it's
  // CSS-hidden at this width; resetting the state here — not just the derived prop below — also
  // stops it popping back open if the viewport narrows again without a fresh tap on the toggle.
  if (isDesktop && mobileOpen) {
    setMobileOpen(false);
  }
  const items = visibleNavigationItems(NAVIGATION[context.module.id], user.permissions);

  return (
    <ApplicationContextProvider value={context}>
      <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
        <WorkspaceDrawer
          items={items}
          navigationAriaLabel={context.module.name}
          collapsed={collapsed}
          onToggleCollapsed={() => {
            const next = !collapsed;
            setCollapsed(next);
            writeNavCollapsed(next);
          }}
          mobileOpen={mobileOpen && !isDesktop}
          onMobileClose={() => {
            setMobileOpen(false);
          }}
          footerTitle={context.organization.name}
          footerSubtitle={context.branch.name}
        />
        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <GlobalHeader
            user={user}
            onOpenNavigation={() => {
              setMobileOpen(true);
            }}
          />
          <Box component="main" sx={{ flexGrow: 1, px: { xs: 3.5, md: 6 }, pt: 5, pb: 4 }}>
            {children}
          </Box>
          <AppFooter />
        </Box>
      </Box>
    </ApplicationContextProvider>
  );
}
