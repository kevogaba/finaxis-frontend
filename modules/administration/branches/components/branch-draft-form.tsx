'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import type { ActionResult, FormAction } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { createBranchDraft, updateBranch } from '../branch-actions';
import {
  ADDRESS_KEYS,
  BRANCH_TYPE_SUGGESTIONS,
  otherAddressEntries,
  type AddressKey,
  type BranchDetail,
} from '../branch-contract';
import {
  branchDraftSchema,
  branchEditSchema,
  changedBranchFields,
  timeZones,
  type BranchDraftValues,
} from '../branch-rules';

const FIELDS = [
  'branchCode',
  'branchName',
  'branchType',
  'parentBranchId',
  'timezone',
  ...ADDRESS_KEYS,
] as const;

/** Decision Q9's labels. */
const ADDRESS_LABELS: Record<AddressKey, string> = {
  line_1: 'Address line 1',
  line_2: 'Address line 2',
  city: 'City or town',
  region: 'Region',
  postal_code: 'Postal code',
};

const FIELD_LABELS: Record<(typeof FIELDS)[number], string> = {
  branchCode: 'Branch code',
  branchName: 'Branch name',
  branchType: 'Branch type',
  parentBranchId: 'Parent branch',
  timezone: 'Timezone',
  ...ADDRESS_LABELS,
};

const NOTHING_CHANGED = "You haven't changed anything yet.";

// Mirrors ReasonDialog's own I1 catch (components/data-display/reason-dialog.tsx): never
// `caught.message` (a network drop, a proxy's non-RSC 502/504, or a stale deployment's
// UnrecognizedActionError may carry detail unsafe to show).
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

interface BranchDraftFormProps {
  /** Edit mode (BG-13): the branch's stored values. The code and type show read-only and are never
   * sent; only changed fields go to `updateBranch`, and Cancel returns to the record. */
  branch?: Pick<
    BranchDetail,
    'id' | 'branchCode' | 'branchName' | 'branchType' | 'parentBranchId' | 'timezone' | 'address'
  >;
  /** Every branch the index resolved (≤ 500), as `Name (CODE)`. */
  parents: readonly { id: string; label: string }[];
  /** The organisation's zone (or UTC) — listed even where Intl omits it (V8 has no `UTC`). */
  defaultTimeZone: string;
  /** The organisation the page rendered with (I2): sent only when present, so `runServerAction`
   * can refuse a submit made after the user switched organisation in another tab. */
  contextOrganisationId?: string;
  /** The Server Action submitted: 08's tenant create by default. Layer 17's client wrapper passes
   * the platform one (a Server Component never passes a function, AGENTS.md). */
  action?: FormAction;
  /** Where Cancel goes. */
  cancelHref?: string;
  /** Extra hidden fields the action needs, e.g. layer 17's `tenantId`. */
  hiddenFields?: Readonly<Record<string, string>>;
  /** Replaces the Parent branch helper "Optional." when the options couldn't load or were capped. */
  parentsNote?: string;
}

/**
 * Create branch draft (spec §10.3) — the first multi-field form, so React Hook Form + the zod
 * resolver (spec §6.4); server field errors merge back with `applyFieldErrors`. One idempotency
 * key per mount: a retry after a failure replays safely; success redirects to the record. With
 * `branch`, the same fields edit it (BG-13).
 */
export function BranchDraftForm({
  branch,
  parents,
  defaultTimeZone,
  contextOrganisationId,
  action = createBranchDraft,
  cancelHref = '/admin/branches',
  hiddenFields,
  parentsNote,
}: BranchDraftFormProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [zones] = useState(() => timeZones(branch?.timezone ?? defaultTimeZone));
  const [schema] = useState(() => (branch ? branchEditSchema(branch) : branchDraftSchema));
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BranchDraftValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchCode: branch?.branchCode ?? '',
      branchName: branch?.branchName ?? '',
      branchType: branch?.branchType ?? 'OPERATIONS',
      parentBranchId: branch?.parentBranchId ?? '',
      timezone: branch?.timezone ?? defaultTimeZone,
      ...Object.fromEntries(ADDRESS_KEYS.map((key) => [key, branch?.address[key] ?? ''])),
    },
  });
  const otherAddress = otherAddressEntries(branch?.address ?? {});
  const submitRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await (branch ? updateBranch : action)(previous, formData);
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
    if (!failure) return;
    applyFieldErrors(setError, failure.fieldErrors, FIELDS);
    // A failure that names no field (BG-18's 403, a 409, a network error) leaves applyFieldErrors
    // nothing to focus, and Create draft went disabled while it held focus, so focus fell to
    // <body> and the next Tab starts past the form (gate finding I2). ReasonDialog does the same.
    if (!FIELDS.some((name) => failure.fieldErrors[name] !== undefined)) submitRef.current?.focus();
  }, [failure, setError]);

  const onValid = (values: BranchDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    if (branch) {
      const changes = changedBranchFields(branch, values);
      // Cleared on the next submit (react-hook-form's root errors don't persist).
      if (Object.keys(changes).length === 0) {
        setError('root', { message: NOTHING_CHANGED });
        return;
      }
      formData.set('branchId', branch.id);
      for (const [name, value] of Object.entries(changes)) formData.set(name, value);
    } else {
      for (const name of FIELDS) formData.set(name, values[name] ?? '');
    }
    for (const [name, value] of Object.entries(hiddenFields ?? {})) formData.set(name, value);
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
      {errors.root?.message && <Alert severity="info">{errors.root.message}</Alert>}
      <TextField
        label="Branch code"
        required={!branch}
        {...register('branchCode')}
        error={Boolean(errors.branchCode)}
        helperText={
          errors.branchCode?.message ??
          (branch
            ? "A branch's code can't change."
            : '2–20 capital letters, digits, underscores or hyphens, e.g. WESTLANDS.')
        }
        slotProps={{
          htmlInput: {
            maxLength: 20,
            autoCapitalize: 'characters',
            spellCheck: false,
            readOnly: Boolean(branch),
          },
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
      {branch ? (
        <TextField
          label="Branch type"
          {...register('branchType')}
          helperText="A branch's type can't change."
          slotProps={{ htmlInput: { readOnly: true } }}
        />
      ) : (
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
      )}
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
                helperText={errors.parentBranchId?.message ?? parentsNote ?? 'Optional.'}
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
      <Box
        component="fieldset"
        sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: 'grid', gap: 4 }}
      >
        <Typography component="legend" variant="subtitle1" sx={{ p: 0, mb: 4 }}>
          Address (optional)
        </Typography>
        {ADDRESS_KEYS.map((key) => (
          <TextField
            key={key}
            label={ADDRESS_LABELS[key]}
            {...register(key)}
            error={Boolean(errors[key])}
            helperText={errors[key]?.message}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
        ))}
        {otherAddress.map(([key, value]) => (
          // Decision Q9: a key outside the five is shown and kept as stored, never edited here.
          <TextField
            key={key}
            label={key}
            value={value}
            helperText="Kept as stored."
            slotProps={{ htmlInput: { readOnly: true } }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          component={NextLink}
          href={branch ? `/admin/branches/${branch.id}` : cancelHref}
          variant="outlined"
          disabled={pending}
        >
          Cancel
        </Button>
        <Button ref={submitRef} type="submit" variant="contained" loading={pending}>
          {branch ? 'Save changes' : 'Create draft'}
        </Button>
      </Box>
    </Box>
  );
}
