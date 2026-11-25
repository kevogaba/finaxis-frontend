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
import { load } from '@/lib/api/load';
import { TenantDraftWizard } from '@/modules/platform-administration/tenants/components/tenant-draft-wizard';
import { isInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import {
  tenantAmendDefaults,
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
  if (!isInstitutionId(tenantId)) notFound();

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
  const header = <PageHeader eyebrow={EYEBROW} title={`Amend ${record.displayName}`} />;
  const backToRecord = (
    <Button component={NextLink} href={`/platform-admin/tenants/${tenantId}`} variant="outlined">
      Back to the record
    </Button>
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
          <ForbiddenState action={backToRecord} />
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
            action={backToRecord}
          />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      {/* BG-14: pre-filled from the draft, its first administrator included (the detail returns
          it to a holder of tenant.update_draft while it is a draft). Past both checks above, a
          null one is a draft with no bootstrap record, whose amend would discard one. */}
      <TenantDraftWizard
        tenantId={tenantId}
        withoutAdministrator={record.admin === null}
        defaults={tenantAmendDefaults(record)}
        options={tenantFormOptions(record)}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
