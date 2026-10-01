'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import NextLink from '@/components/navigation/next-link';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { createRole, updateRole } from '../role-actions';
import type { RoleDetail } from '../role-contract';
import { roleDraftSchema, roleEditFormSchema, type RoleDraftValues } from '../role-rules';

const FIELDS = ['roleCode', 'roleName', 'description'] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = {
  roleCode: 'Role code',
  roleName: 'Role name',
  description: 'Description',
};

// Mirrors ReasonDialog's own I1 catch: never `caught.message` (a network drop, a proxy's non-RSC
// 502/504, or a stale deployment's UnrecognizedActionError may carry detail unsafe to show).
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

interface RoleFormProps {
  /** Edit mode: the code shows read-only and is never sent (UpdateRole has no code, contract §D). */
  role?: Pick<RoleDetail, 'id' | 'roleCode' | 'roleName' | 'description'>;
  /** I2: the organisation the page rendered with; sent only when present. */
  contextOrganisationId?: string;
}

/**
 * Create or edit a custom role (spec §10.4) with React Hook Form and the zod resolver (spec
 * §6.4). Server field errors merge back with `applyFieldErrors`, and client failures get an error
 * summary (spec §9). One idempotency key per mount: a retry after a failure replays safely, and
 * success redirects (Ruling 17).
 */
export function RoleForm({ role, contextOrganisationId }: RoleFormProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RoleDraftValues>({
    resolver: role ? zodResolver(roleEditFormSchema) : zodResolver(roleDraftSchema),
    defaultValues: {
      roleCode: role?.roleCode ?? '',
      roleName: role?.roleName ?? '',
      description: role?.description ?? '',
    },
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await (role ? updateRole : createRole)(previous, formData);
      } catch (caught) {
        // The success path is a Server Action redirect(), which must keep propagating rather
        // than being swallowed as a form failure (07 I1's defect class).
        unstable_rethrow(caught);
        return {
          ok: false,
          formError: SUBMIT_FAILED,
          fieldErrors: {},
          code: 'network_error',
          requestId: null,
        };
      }
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  // From an effect, not the reducer: RHF's setError commits outside the action's transition
  // (BranchDraftForm's note).
  useEffect(() => {
    if (failure) applyFieldErrors(setError, failure.fieldErrors, FIELDS);
  }, [failure, setError]);
  // Spec §9: the summary lists only the resolver's own errors. applyFieldErrors tags server field
  // errors `type: 'server'`, and the failure Alert already covers them (BranchDraftForm's V2).
  const invalid = FIELDS.filter((name) => errors[name] && errors[name].type !== 'server');

  const onValid = (values: RoleDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    if (role) formData.set('roleId', role.id);
    else formData.set('roleCode', values.roleCode);
    formData.set('roleName', values.roleName);
    formData.set('description', values.description);
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onValid)(event);
      }}
      sx={{ p: 4.5, maxWidth: 640, display: 'grid', gap: 4 }}
    >
      {failure && (
        <Alert severity="error">
          {failure.formError}
          {failure.requestId && ` Reference: ${failure.requestId}`}
        </Alert>
      )}
      {invalid.length > 0 && (
        <Alert severity="error">Check {invalid.map((name) => LABELS[name]).join(', ')}.</Alert>
      )}
      <TextField
        label="Role code"
        required={!role}
        {...register('roleCode')}
        error={Boolean(errors.roleCode)}
        helperText={
          errors.roleCode?.message ??
          (role
            ? "A role's code can't change."
            : '2–20 capital letters, digits, underscores or hyphens, e.g. TELLER.')
        }
        slotProps={{
          htmlInput: {
            maxLength: 20,
            autoCapitalize: 'characters',
            spellCheck: false,
            readOnly: Boolean(role),
          },
        }}
      />
      <TextField
        label="Role name"
        required
        {...register('roleName')}
        error={Boolean(errors.roleName)}
        helperText={errors.roleName?.message}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <TextField
        label="Description"
        multiline
        minRows={2}
        {...register('description')}
        error={Boolean(errors.description)}
        helperText={
          errors.description?.message ??
          (role ? 'Optional. A description can be replaced but not removed.' : 'Optional.')
        }
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          component={NextLink}
          href={role ? `/admin/roles/${role.id}` : '/admin/roles'}
          variant="outlined"
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {role ? 'Save changes' : 'Create role'}
        </Button>
      </Box>
    </Box>
  );
}
