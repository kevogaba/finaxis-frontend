import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, permissionHolder } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { UUID_PATTERN } from '@/lib/api/wire';
import {
  isMaker,
  makerGate,
  SELF_APPROVAL_NOTE_BRANCHES,
} from '@/modules/administration/approvals/maker-checker';
import {
  availableBranchActions,
  branchTypeLabel,
  sentBackNote,
} from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { BranchLifecycleActions } from '@/modules/administration/branches/components/branch-lifecycle-actions';
import { readMakerCheckerSwitch } from '@/modules/administration/settings/settings-service';

export const metadata: Metadata = { title: 'Branch record' };

interface BranchRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}

/** Record shell (spec §9): the hero record is read once here; each tab fetches its own data. */
export default async function BranchRecordLayout({ children, params }: BranchRecordLayoutProps) {
  const { branchId } = await params;
  if (!UUID_PATTERN.test(branchId)) notFound();

  const [branch, selected] = await Promise.all([
    load(getBranch(branchId)),
    getCurrentContextProfile(),
  ]);
  const resolved = selected.kind === 'resolved' ? selected : null;

  if (!branch.ok) {
    if (branch.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · Branch record" title="Branch record" />
        <Paper>
          {/* BG-03: a branch-scoped caller gets 403, never 404, for a branch it can't reach. */}
          {branch.problem.code === 'forbidden' ? (
            <ForbiddenState description="You don't have access to this branch." />
          ) : (
            <ErrorState problem={branch.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = branch.value;
  const holder = permissionHolder(resolved?.profile);
  const me = resolved?.profile.user_id ?? '';
  const actions = availableBranchActions(record, holder, me);
  // Only the copy needs it: suspending or closing the selected branch ends the working context.
  const selectedHere = resolved?.context.branch?.id === record.id;
  // BG-08: the tenant route refuses the record's creator (`created_by`), not its submitter. The
  // switch is read only when the caller drafted it and Activate is on offer (decision Q4: unread,
  // Activate stays on offer, and the platform's named refusal explains a refusal).
  const makers = [record.createdBy?.id];
  const gate = makerGate({
    makerIds: makers,
    callerId: me,
    switchState:
      actions.includes('activate') && isMaker(makers, me)
        ? await readMakerCheckerSwitch('branch_creation', holder)
        : 'unknown',
  });
  const base = `/admin/branches/${branchId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/branches', label: 'Back to branches' }}
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow="Administration · Branch record"
        title={record.branchName}
        subtitle={[record.branchCode, branchTypeLabel(record.branchType), sentBackNote(record)]
          .filter(Boolean)
          .join(' · ')}
        status={<StatusChip value={record.status} />}
        actions={
          // Keep RecordHero's actions prop undefined (not an empty component) when there are no
          // actions: RecordHero (frozen kit) renders its actions box whenever it is truthy, which
          // would leave an empty band at 375px.
          actions.length > 0 ? (
            <BranchLifecycleActions
              branchId={branchId}
              branchCode={record.branchCode}
              branchName={record.branchName}
              actions={actions}
              activateBlocked={gate === 'blocked'}
              warning={gate === 'allowed-self-approval' ? SELF_APPROVAL_NOTE_BRANCHES : null}
              selectedHere={selectedHere}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.branchName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          ...(can(holder, 'branch_assignment.view')
            ? [{ href: `${base}/users`, label: 'Users' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
