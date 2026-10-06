import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { formatBusinessDate, formatInstant, shortId } from '@/lib/format';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { institutionBranchesHref } from '@/modules/platform-administration/branches/institution-branch-query';
import {
  BRANCH_DETAIL_DESCRIPTION,
  parseBranchId,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import {
  getInstitutionBranch,
  getInstitutionBranchIndex,
} from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Branch record' };

const EYEBROW = 'Platform administration · Branch record';

/** The platform workspace shows instants in UTC, labelled (spec §9). */
function utc(iso: string): string {
  const when = formatInstant(iso, 'UTC');
  return `${when.date} · ${when.time}`;
}

interface InstitutionBranchPageProps {
  params: Promise<{ tenantId: string; branchId: string }>;
}

/** A branch read-only (spec §11.2): the platform has no branch lifecycle, edit or address (BG-13). */
export default async function InstitutionBranchPage({ params }: InstitutionBranchPageProps) {
  const raw = await params;
  const tenantId = parseInstitutionId(raw.tenantId);
  const branchId = parseBranchId(raw.branchId);
  if (!tenantId || !branchId) notFound(); // rule 7: before any read

  const [branch, tenant] = await Promise.all([
    load(getInstitutionBranch(tenantId, branchId)),
    load(getTenant(tenantId)),
  ]);
  if (!branch.ok) {
    if (branch.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Branch record" />
        <Paper>
          {branch.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={branch.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = branch.value;
  // A name only: a failed read degrades to the short id, never to a false name (rule 9).
  const institution = tenant.ok ? tenant.value.displayName : null;
  const parents = record.parentBranchId ? await load(getInstitutionBranchIndex(tenantId)) : null;
  const parentName =
    record.parentBranchId && parents?.ok
      ? parents.value.names.get(record.parentBranchId)?.name
      : undefined;
  const branchesHref = institutionBranchesHref(tenantId);

  const items: DescriptionItem[] = [
    { label: 'Branch name', value: record.branchName },
    { label: 'Branch code', value: record.branchCode },
    {
      label: 'Institution',
      value: (
        <Link component={NextLink} href={`/platform-admin/tenants/${tenantId}`}>
          {institution ?? shortId(tenantId)}
        </Link>
      ),
    },
    { label: 'Type', value: branchTypeLabel(record.branchType) },
    { label: 'Status', value: <StatusChip value={record.status} /> },
    {
      label: 'Parent branch',
      value: record.parentBranchId ? (
        <Link component={NextLink} href={`${branchesHref}/${record.parentBranchId.toLowerCase()}`}>
          {parentName ?? shortId(record.parentBranchId)}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Timezone', value: record.timezone },
    { label: 'Last status reason', value: record.statusReason ?? '—' },
    // Never set by the API today (BG-13): shown only when present.
    ...(record.openedOn
      ? [{ label: 'Opened on', value: formatBusinessDate(record.openedOn, 'short') }]
      : []),
    ...(record.closedOn
      ? [{ label: 'Closed on', value: formatBusinessDate(record.closedOn, 'short') }]
      : []),
    { label: 'Created (UTC)', value: utc(record.createdAt) },
    { label: 'Updated (UTC)', value: utc(record.updatedAt) },
    { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
  ];

  return (
    <>
      <RecordHero
        back={{ href: branchesHref, label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow={EYEBROW}
        title={record.branchName}
        subtitle={institution ? `${record.branchCode} · ${institution}` : record.branchCode}
        status={<StatusChip value={record.status} />}
      />
      <Box sx={{ mt: 4 }}>
        <SectionCard title="Branch details" description={BRANCH_DETAIL_DESCRIPTION}>
          <DescriptionList items={items} />
        </SectionCard>
      </Box>
    </>
  );
}
