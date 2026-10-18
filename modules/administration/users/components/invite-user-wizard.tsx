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
import { useForm, type FieldErrors, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import { WizardForm, type WizardStep } from '@/components/data-display/wizard-form';
import type { ActionResult } from '@/lib/api/action-result';
import { applyFieldErrors } from '@/lib/apply-field-errors';
import { inviteUser } from '../invite-actions';
import {
  EMAIL_CHECK_FAILED,
  EMAIL_CHECK_REFUSED,
  emailCheckSchema,
  IDENTITY_FIELDS,
  IDENTITY_LABELS,
  INVITATION_FIELDS,
  memberEmailMessage,
  SESSION_EXPIRED,
  USERS_HREF,
} from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import type { MembershipStatus } from '../user-contract';
import type { SelectOption } from '../user-rules';
import { InviteAccessFields } from './invite-access-fields';
import { InviteIdentityFields } from './invite-identity-fields';
import { InviteInvitationFields } from './invite-invitation-fields';
import { InviteReview } from './invite-review';

type FieldName = Path<InviteValues>;

const STEPS: readonly WizardStep[] = [
  { label: 'Identity', helper: 'Who you are inviting' },
  { label: 'Access', helper: 'Their branches and roles' },
  { label: 'Invitation', helper: 'How they are invited' },
  { label: 'Review', helper: 'Check everything before you send it' },
];
const IDENTITY = 0;
const ACCESS = 1;
const INVITATION = 2;
const REVIEW = 3;

/** Every field the Access step renders, rows included, in the order they appear. */
function accessFields(values: InviteValues): FieldName[] {
  return [
    'branchAssignments',
    ...values.branchAssignments.flatMap((_row, index) => [
      `branchAssignments.${index}.branchId` as const,
      `branchAssignments.${index}.assignmentType` as const,
    ]),
    'roleAssignments',
    ...values.roleAssignments.flatMap((_row, index) => [
      `roleAssignments.${index}.roleId` as const,
      `roleAssignments.${index}.scopeType` as const,
      `roleAssignments.${index}.branchId` as const,
    ]),
    'primaryBranchId',
  ];
}

/** A list has no field to focus: its error is set last, and the failure Alert takes focus. */
const LIST_ROOTS: readonly FieldName[] = ['branchAssignments', 'roleAssignments'];

/** The step that renders a field: a server field error returns there. */
function stepOf(name: string): number {
  if ((IDENTITY_FIELDS as readonly string[]).includes(name)) return IDENTITY;
  if ((INVITATION_FIELDS as readonly string[]).includes(name)) return INVITATION;
  if (
    name === 'primaryBranchId' ||
    name.startsWith('branchAssignments') ||
    name.startsWith('roleAssignments')
  ) {
    return ACCESS;
  }
  return -1;
}

const firstStepWith = (names: readonly string[]) => {
  const steps = names.map(stepOf).filter((step) => step !== -1);
  return steps.length === 0 ? -1 : Math.min(...steps);
};

/** A step's error summary: the Identity fields by label, the Access step by section. */
function stepSummary(step: number, errors: FieldErrors<InviteValues>): string[] {
  if (step === IDENTITY) {
    return IDENTITY_FIELDS.filter((name) => errors[name] !== undefined).map(
      (name) => IDENTITY_LABELS[name],
    );
  }
  if (step !== ACCESS) return [];
  const names: string[] = [];
  if (errors.branchAssignments) names.push('Branch assignments');
  if (errors.roleAssignments) names.push('Roles');
  if (errors.primaryBranchId) names.push('Primary branch');
  return names;
}

// Mirrors ReasonDialog's and 16's wizard: never `caught.message`.
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

type EmailCheckOutcome =
  | { kind: 'free' }
  | { kind: 'member'; status: MembershipStatus }
  | { kind: 'failed'; message: string };

/** The Identity step's email check (Ruling 1), through the same-origin route handler. A failed
 * check is said, never read as "free" (Ruling 12, L1); a refused one (403) asks for a reload, since
 * a retry can't pass it. */
async function checkEmail(email: string): Promise<EmailCheckOutcome> {
  try {
    const response = await fetch(
      `/api/tenant/users/invite-check?${new URLSearchParams({ email }).toString()}`,
    );
    if (!response.ok) {
      return {
        kind: 'failed',
        message:
          response.status === 401
            ? SESSION_EXPIRED
            : response.status === 403
              ? EMAIL_CHECK_REFUSED
              : EMAIL_CHECK_FAILED,
      };
    }
    const check = emailCheckSchema.safeParse(await response.json());
    if (!check.success) return { kind: 'failed', message: EMAIL_CHECK_FAILED };
    const status = check.data.membershipStatus;
    return status === null ? { kind: 'free' } : { kind: 'member', status };
  } catch {
    return { kind: 'failed', message: EMAIL_CHECK_FAILED };
  }
}

interface InviteUserWizardProps {
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  rolesCapped: boolean;
  branchesCapped: boolean;
  /** I2: the organisation the page rendered for, appended to the submit. */
  contextOrganisationId?: string;
}

/**
 * Invite user (spec §10.5): one React Hook Form across `WizardForm`'s four steps. Continue validates
 * the step's own fields (Identity also checks the email); Review submits everything with the key
 * minted on mount, so a retry after a failure replays (spec §6.4). A server field error returns to
 * its step. Nothing survives a reload (Ruling 9).
 */
export function InviteUserWizard({
  roles,
  branches,
  rolesCapped,
  branchesCapped,
  contextOrganisationId,
}: InviteUserWizardProps) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [active, setActive] = useState(IDENTITY);
  // After a refused Continue: the step's error summary.
  const [attempted, setAttempted] = useState(false);
  // A failure's Alert stays until the user moves to another step.
  const [failureShown, setFailureShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailure, setCheckFailure] = useState<string | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLDivElement>(null);
  const {
    control,
    register,
    handleSubmit,
    trigger,
    getValues,
    getFieldState,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: EMPTY_INVITE,
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        return await inviteUser(previous, formData);
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

  // React's "previous value" pattern (as 16's wizard): a new failure moves the wizard to the first
  // step holding one of its field errors in the same render, never from an effect.
  const [seenFailure, setSeenFailure] = useState(failure);
  if (failure !== seenFailure) {
    setSeenFailure(failure);
    if (failure) {
      const target = firstStepWith(Object.keys(failure.fieldErrors));
      if (target !== -1) setActive(target);
      setAttempted(false);
      setFailureShown(true);
    }
  }

  // From an effect, as in 16's wizard: RHF's setError commits outside the action's transition.
  // With no field to take focus, the Alert does, so the failure isn't lost.
  useEffect(() => {
    if (!failure) return;
    const focusable: FieldName[] = [
      ...IDENTITY_FIELDS,
      ...accessFields(getValues()).filter((name) => !LIST_ROOTS.includes(name)),
    ];
    applyFieldErrors(setError, failure.fieldErrors, [
      ...focusable,
      ...LIST_ROOTS,
      ...INVITATION_FIELDS,
    ]);
    if (!focusable.some((name) => failure.fieldErrors[name] !== undefined)) {
      failureRef.current?.focus();
    }
  }, [failure, setError, getValues]);

  // A failed check's Alert takes focus, as a submit failure's does: Continue, the focused control,
  // is disabled while the check runs, so focus would otherwise fall to the page (L4).
  useEffect(() => {
    if (checkFailure) checkRef.current?.focus();
  }, [checkFailure]);

  const goTo = (step: number) => {
    setActive(step);
    setAttempted(false);
    setFailureShown(false);
    setCheckFailure(null);
  };

  const onValid = (values: InviteValues) => {
    const formData = new FormData();
    formData.set('idempotencyKey', idempotencyKey);
    for (const name of [...IDENTITY_FIELDS, ...INVITATION_FIELDS]) formData.set(name, values[name]);
    formData.set('primaryBranchId', values.primaryBranchId);
    formData.set('branchAssignments', JSON.stringify(values.branchAssignments));
    formData.set('roleAssignments', JSON.stringify(values.roleAssignments));
    if (contextOrganisationId) formData.set('contextOrganisationId', contextOrganisationId);
    startTransition(() => {
      formAction(formData);
    });
  };

  // Defensive: Continue validated every step, so this only catches a value changed since.
  const onInvalid = (invalid: FieldErrors<InviteValues>) => {
    const target = firstStepWith(Object.keys(invalid));
    goTo(target === -1 ? IDENTITY : target);
    setAttempted(true);
  };

  const continueFromIdentity = async () => {
    setCheckFailure(null);
    if (!(await trigger([...IDENTITY_FIELDS], { shouldFocus: true }))) {
      setAttempted(true);
      return;
    }
    setChecking(true);
    const email = getValues('email');
    // Every Identity answer as Continue validated it: an answer about values edited meanwhile moves
    // nothing, and the next Continue validates and checks them again (Ruling 1, rule 8).
    const validated = JSON.stringify(getValues([...IDENTITY_FIELDS]));
    const outcome = await checkEmail(email);
    setChecking(false);
    if (JSON.stringify(getValues([...IDENTITY_FIELDS])) !== validated) return;
    if (outcome.kind === 'failed') {
      setCheckFailure(outcome.message);
      return;
    }
    if (outcome.kind === 'member') {
      const message = memberEmailMessage(outcome.status);
      setError('email', { type: 'taken', message }, { shouldFocus: true });
      setAttempted(true);
      return;
    }
    // A membership type changed since Access was refused: its branch rule may no longer apply (rule 8).
    if (getFieldState('branchAssignments').error) void trigger('branchAssignments');
    goTo(ACCESS);
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    if (active === REVIEW) {
      void handleSubmit(onValid, onInvalid)(event);
      return;
    }
    event.preventDefault();
    if (active === IDENTITY) {
      void continueFromIdentity();
      return;
    }
    const fields = active === ACCESS ? accessFields(getValues()) : [...INVITATION_FIELDS];
    void trigger(fields, { shouldFocus: true }).then((valid) => {
      if (valid) goTo(active + 1);
      else setAttempted(true);
    });
  };

  const stepErrors = attempted ? stepSummary(active, errors) : [];
  const visibleFailure = failureShown && !pending ? failure : null;
  const values = active === REVIEW ? getValues() : null;

  return (
    <WizardForm
      label="Invite user"
      steps={STEPS}
      active={active}
      onSubmit={onSubmit}
      onBack={() => {
        goTo(active - 1);
      }}
      cancelHref={USERS_HREF}
      submitLabel="Send invitation"
      pending={pending || checking}
      alerts={
        visibleFailure || checkFailure || stepErrors.length > 0 ? (
          <>
            {visibleFailure && (
              <Alert ref={failureRef} tabIndex={-1} severity="error">
                {visibleFailure.formError}
                {visibleFailure.requestId && ` Reference: ${visibleFailure.requestId}`}
              </Alert>
            )}
            {checkFailure && (
              <Alert ref={checkRef} tabIndex={-1} severity="error">
                {checkFailure}
              </Alert>
            )}
            {stepErrors.length > 0 && (
              <Alert severity="error">{`Check these fields: ${stepErrors.join(', ')}.`}</Alert>
            )}
          </>
        ) : undefined
      }
    >
      {active === IDENTITY && (
        <InviteIdentityFields
          control={control}
          register={register}
          trigger={trigger}
          errors={errors}
        />
      )}
      {active === ACCESS && (
        <InviteAccessFields
          control={control}
          trigger={trigger}
          roles={roles}
          branches={branches}
          rolesCapped={rolesCapped}
          branchesCapped={branchesCapped}
          branchListError={errors.branchAssignments}
          roleListError={errors.roleAssignments}
        />
      )}
      {active === INVITATION && <InviteInvitationFields control={control} />}
      {values && (
        <InviteReview
          values={values}
          roles={roles}
          branches={branches}
          pending={pending}
          onEdit={goTo}
        />
      )}
    </WizardForm>
  );
}
