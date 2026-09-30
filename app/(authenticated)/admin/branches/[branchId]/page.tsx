import Link from '@mui/material/Link';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import {
  countActiveAssignments,
  getBranch,
} from '@/modules/administration/branches/branch-service';

interface BranchOverviewPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchOverviewPage({ params }: BranchOverviewPageProps) {
  const { branchId } = await params;
  const [branch, selected, timeZone] = await Promise.all([
    load(getBranch(branchId)), // cached: the layout's read
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
  ]);
  if (!branch.ok) return null; // the layout renders the failure or the guided state

  const record = branch.value;
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [index, assignments] = await Promise.all([
    record.parentBranchId ? getBranchIndex() : Promise.resolve(null),
    can(holder, 'branch_assignment.view')
      ? countActiveAssignments(branchId)
      : Promise.resolve(null),
  ]);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  const items: DescriptionItem[] = [
    { label: 'Branch name', value: record.branchName },
    { label: 'Branch code', value: record.branchCode },
    { label: 'Type', value: branchTypeLabel(record.branchType) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    {
      label: 'Parent branch',
      value: record.parentBranchId ? (
        <Link component={NextLink} href={`/admin/branches/${record.parentBranchId}`}>
          {index?.get(record.parentBranchId)?.name ?? shortId(record.parentBranchId)}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Timezone', value: record.timezone },
    { label: 'Last status reason', value: record.statusReason ?? '—' },
    // Never set by the API today (BG-13) — shown only when present.
    ...(record.openedOn
      ? [{ label: 'Opened on', value: formatBusinessDate(record.openedOn, 'short') }]
      : []),
    ...(record.closedOn
      ? [{ label: 'Closed on', value: formatBusinessDate(record.closedOn, 'short') }]
      : []),
    ...(assignments === null ? [] : [{ label: 'Active assignments', value: String(assignments) }]),
    { label: `Created (${timeZone})`, value: at(record.createdAt) },
    { label: `Updated (${timeZone})`, value: at(record.updatedAt) },
    { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
  ];

  return (
    <SectionCard title="Branch details">
      <DescriptionList items={items} />
    </SectionCard>
  );
}
