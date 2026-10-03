import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { TenantDraftWizard } from '@/modules/platform-administration/tenants/components/tenant-draft-wizard';
import {
  EMPTY_TENANT_DRAFT,
  tenantFormOptions,
} from '@/modules/platform-administration/tenants/tenant-rules';

export const metadata: Metadata = { title: 'Create tenant draft' };

export default async function NewTenantPage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Platform administration · SACCO institutions"
      title="Create tenant draft"
      description="A new institution starts as a draft. Submitting sends it for approval by a different platform administrator, and approval provisions it."
    />
  );

  // The duplicate-code lookup and the redirect after create both read the directory (BG-31).
  if (
    !canAll({ permissions: resolved?.profile.permissions ?? [] }, ['tenant.create', 'tenant.view'])
  ) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <TenantDraftWizard
        defaults={EMPTY_TENANT_DRAFT}
        options={tenantFormOptions()}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
