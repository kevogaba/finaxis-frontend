'use server';

import { createHash } from 'node:crypto';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { runServerAction, type ActionResult } from '@/lib/api/action-result';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/tenant-api';
import { UUID_PATTERN, uuidSchema } from '@/lib/api/wire';
import { ROLE_SCOPE_TYPES, roleCreatedSchema } from './role-contract';
import { MAX_GRANTS_PER_SUBMIT, roleDraftSchema } from './role-rules';
import { getRole } from './role-service';

const idempotencyKey = z.uuid();

/** Swaps the generic status message for one that names the guard behind a known code (spec §6.7).
 * branch-actions.ts keeps the same private helper; a 'use server' module can't export it. */
function explain(
  result: ActionResult,
  code: string,
  formError: string,
  fieldErrors: Partial<Record<string, string>> = {},
): ActionResult {
  if (result.ok || result.code !== code) return result;
  return { ...result, formError, fieldErrors: { ...result.fieldErrors, ...fieldErrors } };
}

// 409 = a system role (immutable) OR an optimistic-lock race (contract §I): never assert which.
const IMMUTABLE =
  "This role can't be changed: system roles are immutable. It may also have changed — refresh and check.";

export async function createRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(
    roleDraftSchema.extend({ idempotencyKey }),
    formData,
    async (input) => {
      const role = roleCreatedSchema.parse(
        await apiPost(
          '/api/v1/tenant/roles',
          {
            role_code: input.roleCode,
            role_name: input.roleName,
            description: input.description || null,
          },
          input.idempotencyKey,
        ),
      );
      // Rethrown by runServerAction (unstable_rethrow): the client lands on the new role's
      // Permissions tab (spec §10.4), where granting comes next.
      redirect(`/admin/roles/${role.roleId}/permissions`);
    },
  );
  // 409 = a duplicate code (contract §E.3) or a race: hedge, and point at the code.
  return explain(
    result,
    'conflict',
    "The role couldn't be created. Its code may already be in use.",
    {
      roleCode: 'This code may already be in use.',
    },
  );
}

const updateInput = roleDraftSchema
  .omit({ roleCode: true })
  .extend({ idempotencyKey, roleId: uuidSchema });

export async function updateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(updateInput, formData, async (input) => {
    await apiPatch(
      `/api/v1/tenant/roles/${input.roleId}`,
      // `null` keeps the current description: it can be replaced, never removed (contract §D).
      // Source f74e44b shows `""` would clear it (BG-34), so a blank field never sends `""`.
      { role_name: input.roleName, description: input.description || null },
      input.idempotencyKey,
    );
    // The edit page shares the record layout with its destination, and the router can reuse that
    // segment, so refresh before redirecting: the hero must show the new name (server-actions.md:
    // "Place revalidation calls before `redirect`"). runServerAction's own refresh() never runs,
    // because redirect() throws first.
    refresh();
    redirect(`/admin/roles/${input.roleId}`);
  });
  return explain(result, 'conflict', IMMUTABLE);
}

const statusInput = z.object({ idempotencyKey, roleId: uuidSchema });

/** Activate and deactivate take no input (contract §E.3), so the body is `{}`. */
function setStatus(path: 'activate' | 'deactivate', formData: FormData): Promise<ActionResult> {
  return runServerAction(statusInput, formData, (input) =>
    apiPost(`/api/v1/tenant/roles/${input.roleId}/${path}`, {}, input.idempotencyKey),
  );
}

export async function activateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(await setStatus('activate', formData), 'conflict', IMMUTABLE);
}

export async function deactivateRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return explain(await setStatus('deactivate', formData), 'conflict', IMMUTABLE);
}

const PERMISSION_CODE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

const grantInput = z.object({
  idempotencyKey,
  roleId: uuidSchema,
  // One hidden field, comma-joined: runServerAction's Object.fromEntries keeps one value per name.
  permissionCodes: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.string().regex(PERMISSION_CODE))
        .min(1, 'Choose at least one permission.')
        .max(
          MAX_GRANTS_PER_SUBMIT,
          `Grant at most ${MAX_GRANTS_PER_SUBMIT} permissions at a time.`,
        ),
    ),
});

/**
 * One stable key per code, derived from the key the drawer minted when it opened: a retry
 * replays every write that already landed (AGENTS.md, Ruling 5). Canonical lowercase hex with
 * version 4 and variant 8: the backend refuses a non-canonical key (400 INVALID_IDEMPOTENCY_KEY).
 */
function grantKey(formKey: string, code: string): string {
  const hex = createHash('sha256').update(`${formKey}:${code}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export async function grantPermissions(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const progress = { granted: 0, total: 0 };
  const result = await runServerAction(grantInput, formData, async (input) => {
    progress.total = input.permissionCodes.length;
    // ponytail: sequential, ≤ MAX_GRANTS_PER_SUBMIT writes per submit (the write budget is
    // 120/min); a bulk-grant endpoint would make this one call.
    for (const code of input.permissionCodes) {
      await apiPost(
        `/api/v1/tenant/roles/${input.roleId}/permissions`,
        { permission_code: code },
        grantKey(input.idempotencyKey, code),
      );
      progress.granted += 1;
    }
  });
  if (result.ok) return result;
  if (progress.granted > 0) {
    // The grants that landed are real, so show them now. A retry replays them (same derived keys)
    // and resumes with the rest.
    refresh();
    return {
      ...result,
      formError: `${progress.granted} of ${progress.total} permissions were granted before this failed. ${result.formError} Retrying is safe.`,
    };
  }
  return explain(result, 'conflict', IMMUTABLE);
}

const removeInput = z.object({ idempotencyKey, roleId: uuidSchema, grantId: uuidSchema });

export async function removePermission(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runServerAction(removeInput, formData, (input) =>
    apiDelete(
      `/api/v1/tenant/roles/${input.roleId}/permissions/${input.grantId}`,
      input.idempotencyKey,
    ),
  );
  return explain(result, 'conflict', IMMUTABLE);
}

const assignInput = z
  .object({
    idempotencyKey,
    roleId: uuidSchema,
    userId: z.string().regex(UUID_PATTERN, 'Choose a user.'),
    scopeType: z.enum(ROLE_SCOPE_TYPES, { error: 'Choose a scope.' }),
    // Rendered only for BRANCH scope (RoleScopeFields).
    branchId: z.union([z.literal(''), uuidSchema]).optional(),
  })
  // BRANCH without a branch is a 500 at source f74e44b (`requireNotNull`, BG-07): never send it.
  .refine((input) => input.scopeType === 'TENANT' || Boolean(input.branchId), {
    error: 'Choose a branch.',
    path: ['branchId'],
  });

/** A frontend-only problem code: the role is no longer ACTIVE (BG-27). */
const ROLE_INACTIVE = 'role_inactive';

export async function assignRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const read = { failed: false };
  const result = await runServerAction(assignInput, formData, async (input) => {
    // BG-27: the backend doesn't check the role's status, so a role deactivated since the drawer
    // opened would still get an ACTIVE assignment. Re-reading narrows that race; only the backend
    // can close it. Fail closed: a role that can't be read isn't assigned. The original error
    // propagates, so a lost session still redirects and the support reference survives.
    const role = await getRole(input.roleId).catch((error: unknown) => {
      read.failed = true;
      throw error;
    });
    if (role.status !== 'ACTIVE') throw new BackendApiError(409, { code: ROLE_INACTIVE });
    return apiPost(
      '/api/v1/tenant/role-assignments',
      {
        user_id: input.userId,
        role_id: input.roleId,
        scope_type: input.scopeType,
        // TENANT must send null (else 422, contract §D).
        branch_id: input.scopeType === 'BRANCH' ? (input.branchId ?? null) : null,
      },
      input.idempotencyKey,
    );
  });
  if (read.failed && !result.ok) {
    return { ...result, formError: "Couldn't check the role's status. Try again." };
  }
  const named = explain(
    result,
    ROLE_INACTIVE,
    "This role is no longer active, so it can't be assigned. Refresh the page and check its status.",
  );
  // 409 = this guard OR a revoked membership, an inactive institution or a race: hedge.
  return explain(
    named,
    'conflict',
    "This user can't be given the role here. For one branch, they must already be assigned to that branch — assign them under Branches first. Their membership may also be revoked; refresh and check.",
  );
}

const revokeInput = z.object({ idempotencyKey, assignmentId: uuidSchema });

export async function revokeRoleAssignment(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Revoking an already-revoked assignment is a no-op 200 (source f74e44b), so no guard to name.
  return runServerAction(revokeInput, formData, (input) =>
    apiDelete(`/api/v1/tenant/role-assignments/${input.assignmentId}`, input.idempotencyKey),
  );
}
