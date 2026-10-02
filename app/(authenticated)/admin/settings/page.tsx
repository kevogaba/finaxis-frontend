import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { SettingsCatalogue } from '@/modules/administration/settings/components/settings-catalogue';
import { SETTINGS_EDIT_ENABLED } from '@/modules/administration/settings/settings-flags';
import { EDIT_UNAVAILABLE } from '@/modules/administration/settings/settings-rules';
import { listSettings } from '@/modules/administration/settings/settings-service';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  // I2: lets a Server Action refuse a stale submit if the user switched organisation elsewhere
  // (07's business-date page uses the same shape).
  const contextOrganisationId =
    selected.kind === 'resolved' ? selected.context.organization.id : undefined;
  const header = (
    <PageHeader
      eyebrow="Administration"
      title="Settings"
      description="Institution-wide operating defaults. Changes keep an optional reason in the audit trail."
    />
  );

  // Spec §6.6–6.7: the nav hides this page without settings.view; a direct visit gets the inline
  // state (and keeps the page's h1), with no backend call.
  if (!can(holder, 'settings.view')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  const settings = await load(listSettings());
  return (
    <>
      {header}
      {settings.ok ? (
        <SettingsCatalogue
          settings={settings.value.items}
          truncated={settings.value.page.hasNext}
          canUpdate={can(holder, 'settings.update')}
          editBlocked={SETTINGS_EDIT_ENABLED ? null : EDIT_UNAVAILABLE}
          contextOrganisationId={contextOrganisationId}
        />
      ) : (
        <Paper>
          <ErrorState problem={settings.problem} />
        </Paper>
      )}
    </>
  );
}
