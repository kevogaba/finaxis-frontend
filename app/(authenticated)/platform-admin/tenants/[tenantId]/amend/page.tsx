import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { isPlatformOrganisation } from '@/config/application-context';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import { TenantDraftWizard } from '@/modules/platform-administration/tenants/components/tenant-draft-wizard';
import {
  EMPTY_TENANT_DRAFT,
  tenantFormOptions,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Amend tenant draft' };

const EYEBROW = 'Platform administration · SACCO institutions';

interface AmendTenantPageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function AmendTenantPage({ params }: AmendTenantPageProps) {
  const { tenantId } = await params;
  if (!UUID_PATTERN.test(tenantId) || isPlatformOrganisation(tenantId)) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Amend tenant draft" />
        <Paper>
          {tenant.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={tenant.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow={EYEBROW}
      title={`Amend ${record.displayName}`}
      description="Amending replaces the whole draft. The platform doesn't return the legal name, registration number or first administrator, so enter them again."
    />
  );

  if (
    !canAll({ permissions: resolved?.profile.permissions ?? [] }, [
      'tenant.update_draft',
      'tenant.view',
    ])
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

  if (record.status !== 'DRAFT') {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState
            title="Only a draft can be amended"
            description="This institution has left the draft stage, so its details can't be changed here."
            action={
              <Button
                component={NextLink}
                href={`/platform-admin/tenants/${tenantId}`}
                variant="outlined"
              >
                Back to the record
              </Button>
            }
          />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <TenantDraftWizard
        tenantId={tenantId}
        defaults={{
          ...EMPTY_TENANT_DRAFT,
          tenantCode: record.tenantCode,
          displayName: record.displayName,
          countryCode: record.countryCode,
          baseCurrencyCode: record.baseCurrencyCode,
          timezone: record.timezone,
        }}
        options={tenantFormOptions(record)}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
