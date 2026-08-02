import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSelectedContextProfile } from '@/auth/context-service';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import { PlatformWorkspaceShell } from '@/modules/platform-administration/components/platform-workspace-shell';

export default async function PlatformAdministrationLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const selectedContext = await getSelectedContextProfile(requestHeaders);

  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  return <PlatformWorkspaceShell>{children}</PlatformWorkspaceShell>;
}
