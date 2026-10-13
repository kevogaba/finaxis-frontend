import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { BranchContextState, ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, getTenantUser } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import {
  branchControlChecks,
  type CheckRead,
  type MakerFact,
} from '@/modules/administration/approvals/approval-checks';
import {
  BRANCH_ACTIVATION_FORBIDDEN,
  BRANCH_APPROVAL_EYEBROW,
  BRANCH_REQUEST,
  CHECKS_DESCRIPTION,
  MAKER_NOT_PERMITTED,
  MAKER_NOT_RECORDED,
  READ_FAILED,
  REQUEST_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableBranchDecisions,
  blockedBranchDecisions,
  BRANCH_ACTIVATION_CODES,
  BRANCH_QUEUE_HREF,
  branchOutcomeNote,
  isSameUser,
} from '@/modules/administration/approvals/approval-rules';
import { getMakerEvent } from '@/modules/administration/approvals/approval-service';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { MakerValue } from '@/modules/administration/approvals/components/request-facts';
import { branchTypeLabel } from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { parseBranchId } from '@/modules/platform-administration/branches/institution-branch-rules';

export const metadata: Metadata = { title: 'Branch approval' };

interface BranchApprovalPageProps {
  params: Promise<{ branchId: string }>;
}

/** A branch activation request (spec §10.6): the request, the branch, the control checks and the
 * decision bar (Activate). A branch context can't reach a pending branch (BG-03, Ruling 11). */
export default async function BranchApprovalPage({ params }: BranchApprovalPageProps) {
  // Rule 7: the id is checked, and canonicalised, before any read (17's parser, client-safe).
  const branchId = parseBranchId((await params).branchId);
  if (!branchId) notFound();

  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const failure = (title: string, content: ReactNode) => (
    <>
      <PageHeader eyebrow={BRANCH_APPROVAL_EYEBROW} title={title} />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canAll(holder, BRANCH_ACTIVATION_CODES)) {
    return failure('Branch approval', <ForbiddenState description={BRANCH_ACTIVATION_FORBIDDEN} />);
  }

  const branch = await load(getBranch(branchId));
  if (!branch.ok) {
    const missing = branch.problem.code === 'resource_not_found';
    // Spec §6.5 / BG-03: with a branch selected every other branch is a 404, so guide instead.
    if (missing && resolved.context.branch) {
      return failure(
        'Branch not available here',
        <BranchContextState
          // PF1 (08): /auth/me branches[] can include SUSPENDED ones; All branches needs two ACTIVE.
          allBranchesAvailable={
            resolved.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
          }
        />,
      );
    }
    if (missing) notFound();
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
  const [maker, branchIndex, timeZone] = await Promise.all([
    can(holder, 'audit.view') ? load(getMakerEvent('branch', record.id)) : null,
    getBranchIndex(), // empty without branch.view: the parent falls back to its short id
    getOrganisationTimeZone(),
  ]);
  const actor = maker?.ok ? (maker.value?.actorUserId ?? null) : null;
  const makerName = actor ? ((await getTenantUser(actor))?.displayName ?? null) : null;
  // A selected branch can only be the record itself here, and it is never pending (§E.4).
  const decisions =
    resolved.context.branch === null ? availableBranchDecisions(record.status, holder) : [];
  const blocked = blockedBranchDecisions(decisions, { draftedByMe: isSameUser(actor, me) });
  const outcome = branchOutcomeNote(record.status);
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };
  const makerFact: CheckRead<MakerFact | null> =
    maker === null
      ? null
      : maker.ok
        ? { ok: true, value: maker.value ? { actorUserId: actor, name: makerName } : null }
        : maker;

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
              { label: 'Drafted by', value: <MakerValue maker={maker} name={makerName} me={me} /> },
              {
                label: `Drafted (${timeZone})`,
                // The maker read's own state: never a dash for a read that failed or wasn't made
                // (rule 9). The reference stays once, on "Drafted by".
                value:
                  maker === null
                    ? MAKER_NOT_PERMITTED
                    : !maker.ok
                      ? READ_FAILED
                      : maker.value
                        ? at(maker.value.occurredAt)
                        : MAKER_NOT_RECORDED,
              },
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
                maker: makerFact,
                me,
                organisationName: resolved.context.organization.name,
              })}
            />
          </SectionCard>
        )}
      </Box>
    </>
  );
}
