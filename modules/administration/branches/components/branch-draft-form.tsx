'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import NextLink from '@/components/navigation/next-link';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { createBranchDraft } from '../branch-actions';
import { BRANCH_TYPE_SUGGESTIONS } from '../branch-contract';
import { branchDraftSchema, type BranchDraftValues } from '../branch-rules';

const FIELDS = ['branchCode', 'branchName', 'branchType', 'parentBranchId', 'timezone'] as const;

const FIELD_LABELS: Record<(typeof FIELDS)[number], string> = {
  branchCode: 'Branch code',
  branchName: 'Branch name',
  branchType: 'Branch type',
  parentBranchId: 'Parent branch',
  timezone: 'Timezone',
};

// Mirrors ReasonDialog's own I1 catch (components/data-display/reason-dialog.tsx): never
// `caught.message` (a network drop, a proxy's non-RSC 502/504, or a stale deployment's
// UnrecognizedActionError may carry detail unsafe to show).
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

interface BranchDraftFormProps {
  /** Every branch the index resolved (≤ 500), as `Name (CODE)`. */
  parents: readonly { id: string; label: string }[];
  /** The organisation's zone (or UTC) — listed even where Intl omits it (V8 has no `UTC`). */
  defaultTimeZone: string;
  /** The organisation the page rendered with (I2): sent only when present, so `runServerAction`
   * can refuse a submit made after the user switched organisation in another tab. */
  contextOrganisationId?: string;
}

function timeZones(defaultTimeZone: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(defaultTimeZone) ? zones : [defaultTimeZone, ...zones];
}

/**
 * Create branch draft (spec §10.3) — the first multi-field form, so React Hook Form + the zod
 * resolver (spec §6.4); server field errors merge back with `applyFieldErrors`. One idempotency
 * key per mount: a retry after a failure replays safely; success redirects to the record.
 * No address field: it's stored but never returned (BG-13).
 */
export function BranchDraftForm({
  parents,
  defaultTimeZone,
  contextOrganisationId,
}: BranchDraftFormProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [zones] = useState(() => timeZones(defaultTimeZone));
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BranchDraftValues>({
    resolver: zodResolver(branchDraftSchema),
    defaultValues: {
      branchCode: '',
      branchName: '',
      branchType: 'OPERATIONS',
      parentBranchId: '',
      timezone: defaultTimeZone,
    },
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await createBranchDraft(previous, formData);
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
  // Server-applied field errors (applyFieldErrors below) carry `type: 'server'`; only the
  // zod-resolver's own errors belong in the client-side summary (spec line ~417), so a server
  // failure's own Alert (above) is never duplicated by this one.
  const clientErrorFields = FIELDS.filter((name) => errors[name] && errors[name].type !== 'server');
  // Applied from an effect, not inline in the reducer above: react-hook-form's `setError` runs
  // through `useSyncExternalStore`, which (by design) commits immediately rather than joining the
  // action's own transition-scheduled commit — inline, the field error and the Alert above landed
  // in two separate commits, and a caller that reads the field error first could observe the form
  // before the Alert commit lands.
  useEffect(() => {
    if (failure) applyFieldErrors(setError, failure.fieldErrors, FIELDS);
  }, [failure, setError]);

  const onValid = (values: BranchDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    for (const name of FIELDS) formData.set(name, values[name]);
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
      {clientErrorFields.length > 0 && (
        <Alert severity="error">
          Check the highlighted fields:{' '}
          {clientErrorFields.map((name) => FIELD_LABELS[name]).join(', ')}.
        </Alert>
      )}
      <TextField
        label="Branch code"
        required
        {...register('branchCode')}
        error={Boolean(errors.branchCode)}
        helperText={
          errors.branchCode?.message ??
          '2–20 capital letters, digits, underscores or hyphens, e.g. WESTLANDS.'
        }
        slotProps={{
          htmlInput: { maxLength: 20, autoCapitalize: 'characters', spellCheck: false },
        }}
      />
      <TextField
        label="Branch name"
        required
        {...register('branchName')}
        error={Boolean(errors.branchName)}
        helperText={errors.branchName?.message}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <Controller
        name="branchType"
        control={control}
        render={({ field }) => (
          <Autocomplete
            freeSolo
            options={BRANCH_TYPE_SUGGESTIONS}
            value={field.value}
            inputValue={field.value}
            onInputChange={(_event, next) => {
              field.onChange(next);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Branch type"
                required
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.branchType)}
                helperText={
                  errors.branchType?.message ??
                  'Free text. The platform itself uses HEAD_OFFICE and OPERATIONS.'
                }
              />
            )}
          />
        )}
      />
      <Controller
        name="parentBranchId"
        control={control}
        render={({ field }) => (
          <Autocomplete
            options={parents}
            value={parents.find((parent) => parent.id === field.value) ?? null}
            onChange={(_event, parent) => {
              field.onChange(parent?.id ?? '');
            }}
            getOptionLabel={(parent) => parent.label}
            isOptionEqualToValue={(parent, selected) => parent.id === selected.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Parent branch"
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.parentBranchId)}
                helperText={errors.parentBranchId?.message ?? 'Optional.'}
              />
            )}
          />
        )}
      />
      <Controller
        name="timezone"
        control={control}
        render={({ field }) => (
          <Autocomplete
            options={zones}
            value={field.value || null}
            onChange={(_event, zone) => {
              field.onChange(zone ?? '');
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Timezone"
                required
                inputRef={field.ref}
                onBlur={field.onBlur}
                error={Boolean(errors.timezone)}
                helperText={errors.timezone?.message}
              />
            )}
          />
        )}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button component={NextLink} href="/admin/branches" variant="outlined" disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          Create draft
        </Button>
      </Box>
    </Box>
  );
}
