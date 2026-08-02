import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { getSelectedContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { AppShell } from '@/components/shell/app-shell';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const sessionUser = await getAuthenticatedUser(requestHeaders);

  if (!sessionUser) {
    redirect('/login?reason=session_expired');
  }

  const selectedContext = await getSelectedContextProfile(requestHeaders);
  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  return (
    <AppShell
      user={profileToFinaxisUser(selectedContext.profile, sessionUser)}
      context={selectedContext.context}
    >
      {children}
    </AppShell>
  );
}
