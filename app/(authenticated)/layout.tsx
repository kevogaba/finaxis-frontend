import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { getCurrentContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { canAnywhere, canTenantWide, permissionHolder } from '@/auth/permissions';
import { serverEnv } from '@/config/env.server';
import { AppShell } from '@/components/shell/app-shell';
import { PlatformNotifications } from '@/components/shell/platform-notifications';
import { TenantNotifications } from '@/components/shell/tenant-notifications';
import {
  NAV_COLLAPSED_COOKIE,
  NAV_COLLAPSED_VALUE,
} from '@/components/shell/navigation-preferences';
import { BusinessDateIndicator } from '@/modules/administration/business-date/components/business-date-indicator';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';

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

  const user = profileToFinaxisUser(selectedContext.profile, sessionUser);
  // Tenant contexts only: the platform context can't call tenant routes (spec §11). The read is
  // checked tenant-wide (BG-33).
  const showBusinessDate =
    selectedContext.context.module.id !== platformAdministrationModule.id &&
    canTenantWide(user, 'business_date.view');
  // BG-03: the branch list answers a branch-scoped `branch.view` at All branches too. Only this
  // boolean reaches the shell, never where the branch grants are held.
  const viewsBranches = canAnywhere(permissionHolder(selectedContext.profile), 'branch.view');

  return (
    <AppShell
      user={user}
      context={selectedContext.context}
      initialNavCollapsed={navCollapsed}
      platformOrganisationId={serverEnv.PLATFORM_ORGANISATION_ID}
      viewsBranches={viewsBranches}
      businessDate={
        showBusinessDate ? (
          <Suspense fallback={null}>
            <BusinessDateIndicator />
          </Suspense>
        ) : null
      }
      notifications={{
        administration: <TenantNotifications />,
        'platform-administration': <PlatformNotifications />,
      }}
    >
      {children}
    </AppShell>
  );
}
