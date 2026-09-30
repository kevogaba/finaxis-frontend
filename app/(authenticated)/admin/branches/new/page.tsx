import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { PageHeader } from '@/components/shell/page-header';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { BranchDraftForm } from '@/modules/administration/branches/components/branch-draft-form';

export const metadata: Metadata = { title: 'Create branch' };

export default async function NewBranchPage() {
  const [selected, timeZone, branches] = await Promise.all([
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Branches"
      title="Create branch"
      description="A new branch starts as a draft. After you submit it, a different administrator must activate it."
    />
  );

  if (!can({ permissions: resolved?.profile.permissions ?? [] }, 'branch.create')) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  return (
    <>
      {header}
      <Paper>
        {resolved?.context.branch && (
          // Spec §6.5: a draft is unreachable from a branch context; submitting needs All branches.
          <Alert severity="info" sx={{ m: 4.5, mb: 0 }}>
            You&apos;re working in {resolved.context.branch.name}. You can create the draft here,
            but switch to All branches to open and submit it.
          </Alert>
        )}
        <BranchDraftForm
          defaultTimeZone={timeZone}
          contextOrganisationId={resolved?.context.organization.id}
          parents={[...branches].map(([id, branch]) => ({
            id,
            label: `${branch.name} (${branch.code})`,
          }))}
        />
      </Paper>
    </>
  );
}
