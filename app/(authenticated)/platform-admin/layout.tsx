import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSelectedContextProfile } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';

export default async function PlatformAdministrationLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const selectedContext = await getSelectedContextProfile(requestHeaders);

  if (selectedContext.kind !== 'resolved') {
    redirect(contextSelectionRedirectPath(requestHeaders));
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  return <>{children}</>;
}
