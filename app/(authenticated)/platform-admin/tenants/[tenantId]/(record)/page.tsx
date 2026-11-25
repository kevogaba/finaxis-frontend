import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
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

/** A stored blank reads as unset, as `null` does: never an empty fact. */
const orDash = (value: string | null) => (value === null || value.trim() === '' ? '—' : value);

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
    // BG-14: returned by the detail since platform #166.
    { label: 'Legal name', value: orDash(record.legalName) },
    { label: 'Registration number', value: orDash(record.registrationNumber) },
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

  // BG-01: a draft carries a reason only when a checker returned it (every transition overwrites
  // `status_reason`, and creating a draft leaves it null). It stays until the next submission.
  const returned = record.status === 'DRAFT' ? record.statusReason : null;

  return (
    <SectionCard title="Institution details">
      {returned && (
        // A long reason wraps inside the alert, never widening the page (Review Focus 5).
        <Alert severity="warning" role="note" sx={{ m: 4.5, mb: 0, overflowWrap: 'anywhere' }}>
          <strong>Returned for changes.</strong> {returned}
        </Alert>
      )}
      <DescriptionList items={items} />
    </SectionCard>
  );
}
