import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';

/** Tenant Administration is not available in the platform context (the API rejects it). */
export default async function AdministrationLayout({ children }: { children: ReactNode }) {
  const selectedContext = await getCurrentContextProfile();
  if (
    selectedContext.kind === 'resolved' &&
    selectedContext.context.module.id === platformAdministrationModule.id
  ) {
    redirect('/platform-admin');
  }
  return <>{children}</>;
}
