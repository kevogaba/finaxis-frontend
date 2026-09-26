import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { getCurrentContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { AppShell } from '@/components/shell/app-shell';
import {
  NAV_COLLAPSED_COOKIE,
  NAV_COLLAPSED_VALUE,
} from '@/components/shell/navigation-preferences';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const sessionUser = await getAuthenticatedUser(requestHeaders);

  if (!sessionUser) {
    redirect('/login?reason=session_expired');
  }

  const selectedContext = await getCurrentContextProfile();
  if (selectedContext.kind !== 'resolved') {
    redirect(contextSelectionRedirectPath(requestHeaders));
  }

  const navCollapsed = (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === NAV_COLLAPSED_VALUE;

  return (
    <AppShell
      user={profileToFinaxisUser(selectedContext.profile, sessionUser)}
      context={selectedContext.context}
      initialNavCollapsed={navCollapsed}
    >
      {children}
    </AppShell>
  );
}
