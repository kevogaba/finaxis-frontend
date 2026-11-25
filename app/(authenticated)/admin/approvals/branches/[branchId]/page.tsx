import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, permissionHolder } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import { branchControlChecks } from '@/modules/administration/approvals/approval-checks';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_APPROVAL_EYEBROW,
  BRANCH_REQUEST,
  CHECKS_DESCRIPTION,
  REQUEST_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableBranchDecisions,
  blockedBranchDecisions,
  BRANCH_QUEUE_HREF,
  branchOutcomeNote,
  canSeeBranchActivations,
} from '@/modules/administration/approvals/approval-rules';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { makerLabel } from '@/modules/administration/approvals/components/request-facts';
import {
  isMaker,
  makerGate,
  SELF_APPROVAL_NOTE_BRANCHES,
} from '@/modules/administration/approvals/maker-checker';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { readMakerCheckerSwitch } from '@/modules/administration/settings/settings-service';
import { parseBranchId } from '@/modules/platform-administration/branches/institution-branch-rules';

export const metadata: Metadata = { title: 'Branch approval' };

interface BranchApprovalPageProps {
  params: Promise<{ branchId: string }>;
}

/** A branch activation request (spec §10.6): the request, the branch, the control checks and the
 * decision bar (Activate), for a tenant-wide approver whichever branch is selected (BG-03). */
export default async function BranchApprovalPage({ params }: BranchApprovalPageProps) {
  // Rule 7: the id is checked, and canonicalised, before any read (17's parser, client-safe).
  const branchId = parseBranchId((await params).branchId);
  if (!branchId) notFound();

  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  const failure = (title: string, content: ReactNode) => (
    <>
      <PageHeader eyebrow={BRANCH_APPROVAL_EYEBROW} title={title} />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canSeeBranchActivations(holder)) {
    return failure('Branch approval', <ForbiddenState description={BRANCH_ACTIVATION_FORBIDDEN} />);
  }

  const branch = await load(getBranch(branchId));
  if (!branch.ok) {
    if (branch.problem.code === 'resource_not_found') notFound();
    return failure(
      'Branch approval',
      branch.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={branch.problem} />
      ),
    );
  }

  const record = branch.value;
  // The backend's ids, never the URL's (Ruling 5).
  const me = resolved.profile.user_id;
  // BG-08: the tenant route refuses the record's creator (and editors, unknowable here), not its
  // submitter; the switch is read only for the creator.
  const makers = [record.createdBy?.id];
  const [branchIndex, timeZone, switchState] = await Promise.all([
    getBranchIndex(), // empty without branch.view: the parent falls back to its short id
    getOrganisationTimeZone(),
    isMaker(makers, me) ? readMakerCheckerSwitch('branch_creation', holder) : ('unknown' as const),
  ]);
  const decisions = availableBranchDecisions(record, holder);
  const gate = makerGate({ makerIds: makers, callerId: me, switchState });
  const blocked = blockedBranchDecisions(decisions, { makerGate: gate });
  const warning =
    decisions.includes('activate') && gate === 'allowed-self-approval'
      ? SELF_APPROVAL_NOTE_BRANCHES
      : null;
  const outcome = branchOutcomeNote(record.status);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  return (
    <>
      <RecordHero
        back={{ href: BRANCH_QUEUE_HREF, label: 'Back to branch activation' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow={BRANCH_APPROVAL_EYEBROW}
        title={record.branchName}
        subtitle={`${record.branchCode} · ${branchTypeLabel(record.branchType)}`}
        status={<StatusChip value={record.status} />}
        actions={
          decisions.length > 0 ? (
            <DecisionBar
              subject={{ kind: 'branch', branchId: record.id }}
              name={record.branchName}
              decisions={decisions}
              blocked={blocked}
              note={null}
              warning={warning}
              contextOrganisationId={resolved.context.organization.id}
            />
          ) : undefined
        }
      />
      <Box sx={{ display: 'grid', gap: 3, mt: 4 }}>
        {outcome && (
          <Alert severity="info" role="note">
            {outcome}{' '}
            <Link component={NextLink} href={`/admin/branches/${record.id}`} underline="always">
              Open the branch record
            </Link>
          </Alert>
        )}
        <SectionCard
          title="Request"
          description={REQUEST_DESCRIPTION}
          actions={
            can(holder, 'audit.view') ? (
              <Link component={NextLink} href={`/admin/branches/${record.id}/audit`}>
                Open the audit trail
              </Link>
            ) : undefined
          }
        >
          <DescriptionList
            items={[
              { label: 'Request', value: BRANCH_REQUEST },
              { label: 'Institution', value: resolved.context.organization.name },
              { label: 'Drafted by', value: makerLabel(record.createdBy, me) },
              { label: 'Submitted by', value: makerLabel(record.submittedBy, me) },
            ]}
          />
        </SectionCard>
        <SectionCard title="Branch">
          <DescriptionList
            items={[
              { label: 'Branch name', value: record.branchName },
              { label: 'Branch code', value: record.branchCode },
              { label: 'Type', value: branchTypeLabel(record.branchType) },
              {
                label: 'Parent branch',
                value: record.parentBranchId
                  ? (branchIndex.get(record.parentBranchId)?.name ?? shortId(record.parentBranchId))
                  : '—',
              },
              { label: 'Timezone', value: record.timezone },
              { label: `Created (${timeZone})`, value: at(record.createdAt) },
              { label: 'Branch ID', value: <CopyIdButton value={record.id} label="Branch ID" /> },
            ]}
          />
        </SectionCard>
        {record.status === 'PENDING_APPROVAL' && (
          <SectionCard title="Control checks" description={CHECKS_DESCRIPTION}>
            <ControlChecks
              checks={branchControlChecks({
                maker: record.createdBy,
                me,
                switchState,
                organisationName: resolved.context.organization.name,
              })}
            />
          </SectionCard>
        )}
      </Box>
    </>
  );
}
