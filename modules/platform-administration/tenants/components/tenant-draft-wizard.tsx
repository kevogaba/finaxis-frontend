'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Controller, useForm, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { DescriptionList } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { WizardForm, type WizardStep } from '@/components/data-display/wizard-form';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { isoToBusinessDate } from '@/lib/business-date';
import { formatBusinessDate } from '@/lib/format';
import { amendTenantDraft, createTenantDraft } from '../tenant-actions';
import {
  tenantDraftSchema,
  type TenantDraftValues,
  type TenantFormOptions,
  type TenantOption,
} from '../tenant-rules';

type FieldName = keyof TenantDraftValues;
type OptionName =
  | 'countryCode'
  | 'baseCurrencyCode'
  | 'timezone'
  | 'defaultTimezoneSetting'
  | 'baseCurrencySetting';

interface DraftStep extends WizardStep {
  fields: readonly FieldName[];
}

const INSTITUTION: DraftStep = {
  label: 'Institution',
  helper: 'Identity, locale and the first business date',
  fields: [
    'tenantCode',
    'displayName',
    'legalName',
    'registrationNumber',
    'countryCode',
    'baseCurrencyCode',
    'timezone',
    'businessDate',
  ],
};
const ADMINISTRATOR: DraftStep = {
  label: 'First administrator',
  helper: 'Invited when the institution is approved',
  fields: [
    'adminEmail',
    'adminUsername',
    'adminDisplayName',
    'adminPhone',
    'adminSendApplicationInvite',
  ],
};
const SETTINGS: DraftStep = {
  label: 'Initial settings',
  helper: 'Optional settings stored with the draft',
  fields: ['defaultTimezoneSetting', 'baseCurrencySetting', 'auditRetentionDays'],
};
const REVIEW: DraftStep = {
  label: 'Review',
  helper: 'Check everything before you save',
  fields: [],
};

const CREATE_STEPS: readonly DraftStep[] = [INSTITUTION, ADMINISTRATOR, SETTINGS, REVIEW];
// Amend ignores the business date and the settings (contract §D), so it never asks for them.
const AMEND_STEPS: readonly DraftStep[] = [
  {
    ...INSTITUTION,
    helper: 'Identity and locale',
    fields: INSTITUTION.fields.filter((name) => name !== 'businessDate'),
  },
  ADMINISTRATOR,
  REVIEW,
];
const CREATE_FIELDS = CREATE_STEPS.flatMap((step) => step.fields);
const AMEND_FIELDS = AMEND_STEPS.flatMap((step) => step.fields);

const LABELS: Record<FieldName, string> = {
  tenantCode: 'Tenant code',
  displayName: 'Display name',
  legalName: 'Legal name',
  registrationNumber: 'Registration number',
  countryCode: 'Country',
  baseCurrencyCode: 'Base currency',
  timezone: 'Timezone',
  businessDate: 'First business date',
  adminEmail: 'Email',
  adminUsername: 'Username',
  adminDisplayName: 'Full name',
  adminPhone: 'Phone',
  adminSendApplicationInvite: 'Send application invite',
  defaultTimezoneSetting: 'Default timezone setting',
  baseCurrencySetting: 'Base currency setting',
  auditRetentionDays: 'Audit retention (days)',
};

// Mirrors ReasonDialog's and 08's draft form: never `caught.message`.
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

const firstStepWith = (steps: readonly DraftStep[], invalid: (name: FieldName) => boolean) =>
  steps.findIndex((step) => step.fields.some(invalid));

interface OptionFieldProps {
  control: Control<TenantDraftValues>;
  name: OptionName;
  options: readonly TenantOption[];
  required?: boolean;
  hint?: string;
}

/** A choice from the server-built list, so SSR and hydration render the same options. */
function OptionField({ control, name, options, required = false, hint }: OptionFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Autocomplete
          options={options}
          value={options.find((option) => option.value === field.value) ?? null}
          onChange={(_event, option) => {
            field.onChange(option?.value ?? '');
            // A choice is final, so validate it now: a refusal's error clears with the fix.
            field.onBlur();
          }}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, selected) => option.value === selected.value}
          renderInput={(params) => (
            <TextField
              {...params}
              label={LABELS[name]}
              required={required}
              inputRef={field.ref}
              onBlur={field.onBlur}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message ?? hint}
            />
          )}
        />
      )}
    />
  );
}

const labelOf = (options: readonly TenantOption[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

interface TenantDraftReviewProps {
  values: TenantDraftValues;
  options: TenantFormOptions;
  steps: readonly DraftStep[];
  onEdit: (step: number) => void;
}

/** The review step: every answer by step, each step with a way back to it. */
function TenantDraftReview({ values, options, steps, onEdit }: TenantDraftReviewProps) {
  const businessDate = isoToBusinessDate(values.businessDate);
  const shown: Record<FieldName, string> = {
    tenantCode: values.tenantCode,
    displayName: values.displayName,
    legalName: values.legalName || 'Not set',
    registrationNumber: values.registrationNumber || 'Not set',
    countryCode: labelOf(options.countries, values.countryCode),
    baseCurrencyCode: labelOf(options.currencies, values.baseCurrencyCode),
    timezone: values.timezone,
    businessDate: businessDate
      ? formatBusinessDate(businessDate, 'long')
      : "Today in the institution's timezone",
    adminEmail: values.adminEmail,
    adminUsername: values.adminUsername,
    adminDisplayName: values.adminDisplayName,
    adminPhone: values.adminPhone,
    adminSendApplicationInvite: values.adminSendApplicationInvite === 'true' ? 'Yes' : 'No',
    defaultTimezoneSetting: values.defaultTimezoneSetting || 'Not set',
    baseCurrencySetting: values.baseCurrencySetting
      ? labelOf(options.currencies, values.baseCurrencySetting)
      : 'Not set',
    auditRetentionDays: values.auditRetentionDays
      ? String(Number(values.auditRetentionDays))
      : 'Not set',
  };
  return (
    <>
      {steps.slice(0, -1).map((step, index) => (
        <SectionCard
          key={step.label}
          title={step.label}
          headingLevel="h3"
          actions={
            <Button
              size="small"
              aria-label={`Edit ${step.label.toLowerCase()}`}
              onClick={() => {
                onEdit(index);
              }}
            >
              Edit
            </Button>
          }
        >
          <DescriptionList
            columns={1}
            items={step.fields.map((name) => ({ label: LABELS[name], value: shown[name] }))}
          />
        </SectionCard>
      ))}
    </>
  );
}

interface TenantDraftWizardProps {
  /** Amend when set: three steps, the code read-only. Create otherwise. */
  tenantId?: string;
  defaults: TenantDraftValues;
  options: TenantFormOptions;
  /** I2: the organisation the page rendered for, appended to the submit. */
  contextOrganisationId?: string;
}

/**
 * Create tenant draft (spec §11.1) and amend: one React Hook Form across `WizardForm`'s steps.
 * Continue validates the step's own fields; Review submits them all with the key minted on mount,
 * so a retry after a failure replays (spec §6.4). A server field error returns to its step.
 */
export function TenantDraftWizard({
  tenantId,
  defaults,
  options,
  contextOrganisationId,
}: TenantDraftWizardProps) {
  const amend = tenantId !== undefined;
  const steps = amend ? AMEND_STEPS : CREATE_STEPS;
  const fields = amend ? AMEND_FIELDS : CREATE_FIELDS;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [active, setActive] = useState(0);
  // After a refused Continue: the step's error summary.
  const [attempted, setAttempted] = useState(false);
  // A failure's Alert stays until the user moves to another step.
  const [failureShown, setFailureShown] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);
  const {
    control,
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<TenantDraftValues>({
    resolver: zodResolver(tenantDraftSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await (amend ? amendTenantDraft : createTenantDraft)(previous, formData);
      } catch (caught) {
        // Success is the action's redirect(), which must keep propagating (07's I1).
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

  // React's "previous value" pattern (as ListToolbar's search): a new failure moves the wizard to
  // the first step holding one of its field errors in the same render, never from an effect.
  const [seenFailure, setSeenFailure] = useState(failure);
  if (failure !== seenFailure) {
    setSeenFailure(failure);
    if (failure) {
      const target = firstStepWith(steps, (name) => failure.fieldErrors[name] !== undefined);
      if (target !== -1) setActive(target);
      setAttempted(false);
      setFailureShown(true);
    }
  }

  // From an effect, as in 08's draft form: RHF's setError commits outside the action's transition.
  // With no field to take focus, the Alert does, so the failure isn't lost.
  useEffect(() => {
    if (!failure) return;
    applyFieldErrors(setError, failure.fieldErrors, fields);
    if (!fields.some((name) => failure.fieldErrors[name] !== undefined)) {
      failureRef.current?.focus();
    }
  }, [failure, setError, fields]);

  const goTo = (step: number) => {
    setActive(step);
    setAttempted(false);
    setFailureShown(false);
  };
  const current = steps[active] ?? REVIEW;
  const onReview = active === steps.length - 1;

  const onValid = (values: TenantDraftValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    if (tenantId !== undefined) formData.set('tenantId', tenantId);
    for (const name of fields) formData.set(name, values[name]);
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  // Defensive: Continue validated every step, so this only catches a value changed since.
  const onInvalid = (invalid: FieldErrors<TenantDraftValues>) => {
    const target = firstStepWith(steps, (name) => invalid[name] !== undefined);
    goTo(target === -1 ? 0 : target);
    setAttempted(true);
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    if (onReview) {
      void handleSubmit(onValid, onInvalid)(event);
      return;
    }
    event.preventDefault();
    void trigger([...current.fields], { shouldFocus: true }).then((valid) => {
      if (valid) goTo(active + 1);
      else setAttempted(true);
    });
  };

  // An error clears as soon as its field is fixed, not on the blur that follows: that blur can be
  // the click on Continue, and the summary leaving would shift the page under the pointer.
  const text = (name: FieldName, hint?: string) => ({
    ...register(name, {
      onChange: () => {
        if (errors[name] !== undefined) void trigger(name);
      },
    }),
    label: LABELS[name],
    error: errors[name] !== undefined,
    helperText: errors[name]?.message ?? hint,
  });
  const stepErrors = attempted ? current.fields.filter((name) => errors[name] !== undefined) : [];
  const visibleFailure = failureShown && !pending ? failure : null;
  const values = onReview ? getValues() : null;

  return (
    <WizardForm
      label={amend ? 'Amend tenant draft' : 'Create tenant draft'}
      steps={steps}
      active={active}
      onSubmit={onSubmit}
      onBack={() => {
        goTo(active - 1);
      }}
      cancelHref={amend ? `/platform-admin/tenants/${tenantId}` : '/platform-admin/tenants'}
      submitLabel={amend ? 'Save draft' : 'Create draft'}
      pending={pending}
      alerts={
        visibleFailure || stepErrors.length > 0 ? (
          <>
            {visibleFailure && (
              <Alert ref={failureRef} tabIndex={-1} severity="error">
                {visibleFailure.formError}
                {visibleFailure.requestId && ` Reference: ${visibleFailure.requestId}`}
              </Alert>
            )}
            {stepErrors.length > 0 && (
              <Alert severity="error">
                {`Check these fields: ${stepErrors.map((name) => LABELS[name]).join(', ')}.`}
              </Alert>
            )}
          </>
        ) : undefined
      }
    >
      {current.label === INSTITUTION.label && (
        <>
          <TextField
            required
            {...text(
              'tenantCode',
              amend
                ? "The code can't be changed."
                : 'Lowercase letters, digits or hyphens, 3–32 characters.',
            )}
            slotProps={{
              htmlInput: {
                maxLength: 32,
                spellCheck: false,
                autoCapitalize: 'none',
                readOnly: amend,
              },
            }}
          />
          <TextField
            required
            {...text('displayName')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            {...text('legalName', 'Optional.')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            {...text('registrationNumber', 'Optional.')}
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <OptionField control={control} name="countryCode" options={options.countries} required />
          <OptionField
            control={control}
            name="baseCurrencyCode"
            options={options.currencies}
            required
          />
          <OptionField control={control} name="timezone" options={options.timeZones} required />
          {!amend && (
            <TextField
              type="date"
              {...text(
                'businessDate',
                "Optional. Defaults to today in the institution's timezone.",
              )}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </>
      )}
      {current.label === ADMINISTRATOR.label && (
        <>
          <TextField required type="email" autoComplete="off" {...text('adminEmail')} />
          <TextField
            required
            autoComplete="off"
            {...text(
              'adminUsername',
              'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
            )}
            slotProps={{ htmlInput: { maxLength: 50, spellCheck: false, autoCapitalize: 'none' } }}
          />
          <TextField
            required
            autoComplete="off"
            {...text('adminDisplayName')}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            required
            type="tel"
            autoComplete="off"
            {...text('adminPhone', 'International format, e.g. +254712000140.')}
          />
          <Controller
            name="adminSendApplicationInvite"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                label={LABELS.adminSendApplicationInvite}
                control={
                  <Checkbox
                    checked={field.value === 'true'}
                    onChange={(_event, checked) => {
                      field.onChange(checked ? 'true' : 'false');
                    }}
                    onBlur={field.onBlur}
                  />
                }
              />
            )}
          />
        </>
      )}
      {current.label === SETTINGS.label && (
        <>
          <Alert severity="info">
            These settings are stored with the institution, but the platform doesn&apos;t apply them
            yet. Maker-checker always applies, so its switches aren&apos;t offered here, and neither
            is automatic business date advance.
          </Alert>
          <OptionField
            control={control}
            name="defaultTimezoneSetting"
            options={options.timeZones}
            hint="Optional."
          />
          <OptionField
            control={control}
            name="baseCurrencySetting"
            options={options.currencies}
            hint="Optional."
          />
          <TextField
            {...text(
              'auditRetentionDays',
              'Optional. A whole number of days; only the platform can set it.',
            )}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }}
          />
        </>
      )}
      {values && (
        <>
          <TenantDraftReview values={values} options={options} steps={steps} onEdit={goTo} />
          <Alert severity="info">
            {amend
              ? 'Saving replaces the whole draft.'
              : 'Saving creates a draft. Nothing is provisioned until a different platform administrator approves it.'}
          </Alert>
        </>
      )}
    </WizardForm>
  );
}
