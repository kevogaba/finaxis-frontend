import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { applicationContext } from '@/config/application-context';
import { AppShell } from '@/components/shell/app-shell';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await headers());

  if (!user) {
    redirect('/login?reason=session_expired');
  }

  return (
    <AppShell user={user} context={applicationContext}>
      {children}
    </AppShell>
  );
}
