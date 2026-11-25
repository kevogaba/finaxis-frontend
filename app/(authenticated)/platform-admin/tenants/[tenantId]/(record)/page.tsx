import { notFound } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { load } from '@/lib/api/load';
import { formatInstant } from '@/lib/format';
import { makerLabel } from '@/modules/administration/approvals/components/request-facts';
import { isInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import {
  bootstrapStatusLabel,
  countryLabel,
  currencyLabel,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

interface TenantOverviewPageProps {
  params: Promise<{ tenantId: string }>;
}

/** The platform workspace shows instants in UTC, labelled (spec §9). */
function utc(iso: string): string {
  const when = formatInstant(iso, 'UTC');
  return `${when.date} · ${when.time}`;
}

export default async function TenantOverviewPage({ params }: TenantOverviewPageProps) {
  const { tenantId } = await params;
  // The layout answers not-found too, but it renders in parallel: refuse before any fetch.
  if (!isInstitutionId(tenantId)) notFound();
  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)), // cached: the layout's read
    getCurrentContextProfile(), // cached: the layout's
  ]);
  if (!tenant.ok) return null; // the layout renders the failure

  const record = tenant.value;
  const me = selected.kind === 'resolved' ? selected.profile.user_id : '';
  const items: DescriptionItem[] = [
    { label: 'Display name', value: record.displayName },
    { label: 'Tenant code', value: record.tenantCode },
    { label: 'Country', value: countryLabel(record.countryCode) },
    { label: 'Base currency', value: currencyLabel(record.baseCurrencyCode) },
    { label: 'Timezone', value: record.timezone },
    { label: 'Lifecycle', value: <StatusChip value={record.status} /> },
    {
      label: 'Provisioning',
      value: record.bootstrapStatus ? (
        <StatusChip
          value={record.bootstrapStatus}
          label={bootstrapStatusLabel(record.bootstrapStatus)}
        />
      ) : (
        'Not tracked'
      ),
    },
    // BG-08: who asked, as the platform's checker rule reads it.
    { label: 'Requested by', value: makerLabel(record.requestedBy, me) },
    { label: 'Submitted by', value: makerLabel(record.submittedBy, me) },
    { label: 'Created (UTC)', value: utc(record.createdAt) },
    { label: 'Updated (UTC)', value: utc(record.updatedAt) },
    { label: 'Institution ID', value: <CopyIdButton value={record.id} label="Institution ID" /> },
  ];

  return (
    <SectionCard
      title="Institution details"
      description="The legal name, registration number and first administrator are stored with the request, but the platform doesn't return them."
    >
      <DescriptionList items={items} />
    </SectionCard>
  );
}
