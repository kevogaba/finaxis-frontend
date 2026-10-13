import type { ReactNode } from 'react';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { QUEUE_DESCRIPTION } from '@/modules/administration/approvals/approval-copy';
import { actionableUserApprovals } from '@/modules/administration/approvals/approval-notifications';
import {
  approvalQueueTabs,
  BRANCH_ACTIVATION_CODES,
  USER_APPROVAL_CODES,
} from '@/modules/administration/approvals/approval-rules';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';

/** The queue's shell (Ruling 2): the page's only h1 and the tabs the holder can see, as link tabs
 * (each tab is its own route, so its paging lives in its own URL). The detail pages live outside
 * this group, with their own hero. */
export default async function ApprovalQueueLayout({ children }: { children: ReactNode }) {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const users = canAll(holder, USER_APPROVAL_CODES);
  const branches = canAll(holder, BRANCH_ACTIVATION_CODES);
  // Spec §10.6's tab counts are the bell's reads, cached per request, so the pair is read once.
  // load() redirects on a lost session or a stale context; any other failure leaves the label
  // without a number (the tab's own list says when it can't load).
  const [userCounts, branchCount] = await Promise.all([
    users ? load(countUserApprovals()) : null,
    branches ? load(countBranchActivations()) : null,
  ]);
  const tabs = approvalQueueTabs(holder, {
    users: userCounts?.ok ? actionableUserApprovals(userCounts.value) : null,
    branches: branchCount?.ok ? branchCount.value : null,
  });
  return (
    <>
      <PageHeader eyebrow="Administration" title="Approval queue" description={QUEUE_DESCRIPTION} />
      {tabs.length > 0 && <RecordTabs label="Approval queue sections" tabs={tabs} />}
      {children}
    </>
  );
}
