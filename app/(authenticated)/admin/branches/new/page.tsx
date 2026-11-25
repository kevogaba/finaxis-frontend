import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { permissionHolder } from '@/auth/permissions';
import { canCreateBranch } from '@/modules/administration/branches/branch-rules';
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
  const holder = permissionHolder(resolved?.profile);
  const header = (
    <PageHeader
      eyebrow="Administration · Branches"
      title="Create branch"
      description="A new branch starts as a draft. After you submit it, a different administrator must activate it."
    />
  );

  if (!canCreateBranch(holder)) {
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
