import type { Metadata } from 'next';
import { getCurrentContextProfile } from '@/auth/context-service';
import { EmptyState } from '@/components/data-display/empty-state';
import { SectionCard } from '@/components/data-display/section-card';
import { load } from '@/lib/api/load';
import { ProvisioningTimeline } from '@/modules/platform-administration/tenants/components/provisioning-timeline';
import { RetryBootstrapButton } from '@/modules/platform-administration/tenants/components/retry-bootstrap-button';
import {
  canRetryBootstrap,
  provisioningTimeline,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Provisioning' };

interface TenantProvisioningPageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function TenantProvisioningPage({ params }: TenantProvisioningPageProps) {
  const { tenantId } = await params;
  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)), // cached: the layout's read
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) return null; // the layout renders the failure

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const steps = provisioningTimeline(record.status, record.bootstrapStatus);
  const retry = canRetryBootstrap(record.bootstrapStatus, {
    permissions: resolved?.profile.permissions ?? [],
  });

  return (
    <SectionCard
      title="Provisioning"
      description="Approval creates the head office and default roles; the first administrator's identity and invitation follow."
      actions={
        retry ? (
          <RetryBootstrapButton
            tenantId={tenantId}
            tenantName={record.displayName}
            contextOrganisationId={resolved?.context.organization.id}
          />
        ) : undefined
      }
    >
      {steps ? (
        <ProvisioningTimeline steps={steps} failureCode={record.bootstrapFailureCode} />
      ) : (
        <EmptyState
          title="Provisioning isn't tracked for this institution"
          description="It was set up before the platform recorded onboarding steps."
        />
      )}
    </SectionCard>
  );
}
