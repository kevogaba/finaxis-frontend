import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, permissionHolder } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { BranchContextState } from '@/components/data-display/forbidden-state';
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
    const missing = branch.problem.code === 'resource_not_found';
    // Spec §6.5 / BG-03: with a branch selected, every other branch is a 404 — guide instead.
    if (missing && resolved?.context.branch) {
      return (
        <>
          <PageHeader eyebrow="Administration · Branch record" title="Branch not available here" />
          <Paper>
            <BranchContextState
              // PF1: /auth/me branches[] can include SUSPENDED branches, and All branches only
              // helps with more than one ACTIVE branch to switch between.
              allBranchesAvailable={
                resolved.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
              }
            />
          </Paper>
        </>
      );
    }
    if (missing) notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · Branch record" title="Branch record" />
        <Paper>
          <ErrorState problem={branch.problem} />
        </Paper>
      </>
    );
  }

  const record = branch.value;
  const holder = permissionHolder(resolved?.profile);
  const actions = availableBranchActions(record.status, holder);
  // BG-08: the tenant route refuses the record's creator (`created_by`), not its submitter. The
  // switch is read only when the caller drafted it and Activate is on offer (decision Q4: unread,
  // Activate stays on offer, and the platform's named refusal explains a refusal).
  const me = resolved?.profile.user_id ?? '';
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
        subtitle={`${record.branchCode} · ${branchTypeLabel(record.branchType)}`}
        status={<StatusChip value={record.status} />}
        actions={
          // Keep RecordHero's actions prop undefined (not an empty component) when there are no
          // actions: RecordHero (frozen kit) renders its actions box whenever it is truthy, which
          // would leave an empty band at 375px.
          actions.length > 0 ? (
            <BranchLifecycleActions
              branchId={branchId}
              branchName={record.branchName}
              actions={actions}
              activateBlocked={gate === 'blocked'}
              warning={gate === 'allowed-self-approval' ? SELF_APPROVAL_NOTE_BRANCHES : null}
              selectedHere={resolved?.context.branch?.id === branchId}
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
