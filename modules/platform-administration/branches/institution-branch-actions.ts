'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { explain } from '@/lib/api/explain-action-result';
import { apiPost } from '@/lib/api/tenant-api';
import { branchDraftResultSchema } from '@/modules/administration/branches/branch-contract';
import { branchDraftSchema } from '@/modules/administration/branches/branch-rules';
import { isInstitutionId } from '../tenants/institution-id';
import { institutionBranchesHref } from './institution-branch-query';
import {
  BRANCH_CODE_MAY_BE_TAKEN,
  BRANCH_CREATE_CONFLICT,
  BRANCH_CREATE_REFUSED,
} from './institution-branch-rules';

const idempotencyKey = z.uuid();
/** BG-29: never the reserved platform organisation, in any letter case. */
const tenantId = z.string().refine(isInstitutionId, 'Choose an institution.');

/** 08's draft fields, posted to the platform route (contract §E.2). No address: it is stored but
 * never returned (BG-13). */
export async function createInstitutionBranchDraft(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    branchDraftSchema.extend({ idempotencyKey, tenantId }),
    formData,
    async (input) => {
      const institution = input.tenantId.toLowerCase();
      const draft = branchDraftResultSchema.parse(
        await apiPost(
          `/api/v1/platform/tenants/${institution}/branches`,
          {
            branch_code: input.branchCode,
            branch_name: input.branchName,
            branch_type: input.branchType,
            parent_branch_id: input.parentBranchId || null,
            timezone: input.timezone,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client navigates to the draft.
      redirect(`${institutionBranchesHref(institution)}/${draft.branchId.toLowerCase()}`);
    },
  );
  // BG-18: a 403 here is almost always the missing membership inside the institution (the button
  // needs the platform code). 409: a duplicate code or an institution that can't take branches.
  return explain(
    explain(result, 'forbidden', BRANCH_CREATE_REFUSED),
    'conflict',
    BRANCH_CREATE_CONFLICT,
    { branchCode: BRANCH_CODE_MAY_BE_TAKEN },
  );
}
