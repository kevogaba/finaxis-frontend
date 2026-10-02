import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';

export default async function PlatformAdministrationLayout({ children }: { children: ReactNode }) {
  const selectedContext = await getCurrentContextProfile();

  if (selectedContext.kind !== 'resolved') {
    redirect(contextSelectionRedirectPath(await headers()));
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  return <>{children}</>;
}
