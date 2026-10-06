'use client';

import { BranchDraftForm } from '@/modules/administration/branches/components/branch-draft-form';
import { createInstitutionBranchDraft } from '../institution-branch-actions';
import { institutionBranchesHref } from '../institution-branch-query';

interface InstitutionBranchDraftFormProps {
  tenantId: string;
  parents: readonly { id: string; label: string }[];
  parentsNote?: string;
  defaultTimeZone: string;
  contextOrganisationId?: string;
}

/** 08's draft form bound to the platform route. The Server Action is passed here, in a Client
 * Component: a Server Component can't pass a function prop (AGENTS.md). */
export function InstitutionBranchDraftForm({ tenantId, ...form }: InstitutionBranchDraftFormProps) {
  return (
    <BranchDraftForm
      {...form}
      action={createInstitutionBranchDraft}
      cancelHref={institutionBranchesHref(tenantId)}
      hiddenFields={{ tenantId }}
    />
  );
}
