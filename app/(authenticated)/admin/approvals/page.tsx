import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import {
  NO_APPROVAL_ACCESS,
  QUEUE_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import { approvalQueueTabs } from '@/modules/administration/approvals/approval-rules';

export const metadata: Metadata = { title: 'Approval queue' };

/** The navigation entry (spec §8): opens the first tab the holder can see (Ruling 2). */
export default async function ApprovalQueuePage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const [first] = approvalQueueTabs(holder);
  if (first) redirect(first.href);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Approval queue" description={QUEUE_DESCRIPTION} />
      <Paper>
        <ForbiddenState description={NO_APPROVAL_ACCESS} />
      </Paper>
    </>
  );
}
