'use client';

import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { ApplicationContextProvider } from './organization-context';
import { GlobalHeader } from './global-header';

interface AppShellProps {
  user: FinaxisUser;
  context: ApplicationContext;
  children: ReactNode;
}

export function AppShell({ user, context, children }: AppShellProps) {
  return (
    <ApplicationContextProvider value={context}>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <GlobalHeader user={user} />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </ApplicationContextProvider>
  );
}
