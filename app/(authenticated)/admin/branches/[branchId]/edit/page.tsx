import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import { getCurrentContextProfile } from '@/auth/context-service';
import { permissionHolder } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { load } from '@/lib/api/load';
import { getBranchIndex } from '@/lib/api/lookups';
import {
  canEditBranch,
  EDIT_DRAFT_WARNING,
  EDITABLE_BRANCH_STATES,
  parentOptions,
  SCOPED_BRANCHES_NOTE,
  scopedBranchView,
} from '@/modules/administration/branches/branch-rules';
import { getBranch } from '@/modules/administration/branches/branch-service';
import { BranchDraftForm } from '@/modules/administration/branches/components/branch-draft-form';

export const metadata: Metadata = { title: 'Edit branch' };

interface EditBranchPageProps {
  params: Promise<{ branchId: string }>;
}

/** Edit as a page under the record layout, as roles do: its hero stays above (BG-13). */
export default async function EditBranchPage({ params }: EditBranchPageProps) {
  const { branchId } = await params;
  const [branch, selected] = await Promise.all([
    load(getBranch(branchId)), // cached: the layout's read
    getCurrentContextProfile(),
  ]);
  if (!branch.ok) return null; // the layout renders the failure or the guided state

  const record = branch.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  if (!canEditBranch(record, holder)) {
    const stateRefuses = !EDITABLE_BRANCH_STATES.includes(record.status);
    return (
      <SectionCard title="Edit branch">
        <ForbiddenState
          title={stateRefuses ? "This branch can't be edited" : undefined}
          description={stateRefuses ? 'Only a draft or an active branch can be edited.' : undefined}
        />
      </SectionCard>
    );
  }

  // The branches `branch.view` covers; the current parent shows whether or not it is among them.
  const index = await getBranchIndex();
  return (
    <SectionCard
      title="Edit branch"
      description="Change the name, parent branch, timezone or address. The code and type are fixed."
    >
      {record.status === 'DRAFT' && (
        <Alert severity="warning" sx={{ m: 4.5, mb: 0 }}>
          {EDIT_DRAFT_WARNING}
        </Alert>
      )}
      <BranchDraftForm
        branch={{
          id: record.id,
          branchCode: record.branchCode,
          branchName: record.branchName,
          branchType: record.branchType,
          parentBranchId: record.parentBranchId,
          timezone: record.timezone,
          address: record.address,
        }}
        parents={parentOptions(index, record.id, record.parentBranchId)}
        // BG-03: a branch-scoped editor's index lists only the branches its `branch.view` covers.
        parentsNote={scopedBranchView(holder) ? `Optional. ${SCOPED_BRANCHES_NOTE}` : undefined}
        defaultTimeZone={record.timezone}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </SectionCard>
  );
}
