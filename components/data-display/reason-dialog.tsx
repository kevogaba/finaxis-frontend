'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { unstable_rethrow } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import type { ActionResult, FormAction } from '@/lib/api/action-result';

type FieldErrors = Partial<Record<string, string>>;

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  reason: 'optional' | 'required';
  action: FormAction;
  onClose: () => void;
  onSuccess: () => void;
  /** Extra fields rendered above the reason (e.g. the advance date). */
  fields?: (fieldErrors: Partial<Record<string, string>>) => ReactNode;
  /**
   * The organisation the page rendered for, carried as a hidden input so a Server Action can
   * refuse a stale submit after the user switched organisation in another tab (I2).
   */
  contextOrganisationId?: string;
}

const REASON_MAX = 500;
const NO_ERRORS: FieldErrors = {};
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

/**
 * Wraps `ReasonForm` in a `Dialog` that ignores Escape/backdrop while a submit is pending, so a
 * slow request can't be closed out from under itself and lose its idempotency key (D2).
 */
export function ReasonDialog({ open, onClose, ...form }: ReasonDialogProps) {
  const [pending, setPending] = useState(false);
  const descriptionId = useId();
  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-describedby={descriptionId}
    >
      <ReasonForm
        {...form}
        onClose={onClose}
        onPendingChange={setPending}
        descriptionId={descriptionId}
      />
    </Dialog>
  );
}

/**
 * Mounted once per opening (the dialog unmounts closed content): a fresh idempotency key and a
 * clean result each time. A failed attempt keeps its key, so retrying replays safely (spec §6.4).
 */
function ReasonForm({
  title,
  description,
  confirmLabel,
  reason,
  action,
  onClose,
  onSuccess,
  fields,
  contextOrganisationId,
  onPendingChange,
  descriptionId,
}: Omit<ReasonDialogProps, 'open'> & {
  onPendingChange: (pending: boolean) => void;
  descriptionId: string;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      try {
        const result = await action(previous, formData);
        if (result.ok) onSuccess();
        return result;
      } catch (caught) {
        // A Next.js control-flow error (redirect()/notFound()) must keep propagating rather than
        // being swallowed as a form failure — a Server Action's own redirect() reaches this
        // reducer as a rejection, not a normal return (server-action-reducer.js:241-259).
        unstable_rethrow(caught);
        // Never `caught.message`: a network drop, a proxy's non-RSC 502/504, or a stale
        // deployment's UnrecognizedActionError may carry detail unsafe to show, and retrying an
        // unrecognized-action failure from the same page would otherwise loop forever.
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
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.fieldErrors ?? NO_ERRORS;

  // A failed submit can strand focus on the dialog's own container (going disabled blurs the
  // submit button, and MUI's FocusTrap parks it there once nothing else claims it) — recover it
  // onto the field the error names, or the submit button otherwise.
  useEffect(() => {
    if (!failure) return;
    const invalidField = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalidField ?? submitRef.current)?.focus();
  }, [failure]);

  // `<form action={formAction}>` makes React reset every uncontrolled field (reason, and
  // whatever `fields` renders) via requestFormReset on every submit, success or failure
  // (react-dom's startHostTransition calls it before running the action). Dispatching
  // `formAction` ourselves from onSubmit never goes through that DOM-action-prop wiring, so a
  // retry after a failure keeps what the user typed; native constraint validation still runs
  // before `submit` fires.
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    formRef.current = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <DialogContentText id={descriptionId}>{description}</DialogContentText>
        {failure && (
          <Alert severity="error">
            {failure.formError}
            {failure.requestId && ` Reference: ${failure.requestId}`}
          </Alert>
        )}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {contextOrganisationId && (
          <input type="hidden" name="contextOrganisationId" value={contextOrganisationId} />
        )}
        {fields?.(fieldErrors)}
        <TextField
          name="reason"
          label={reason === 'required' ? 'Reason' : 'Reason (optional)'}
          required={reason === 'required'}
          multiline
          minRows={2}
          error={Boolean(fieldErrors.reason)}
          helperText={fieldErrors.reason}
          slotProps={{
            htmlInput: { maxLength: REASON_MAX, minLength: reason === 'required' ? 3 : undefined },
          }}
        />
      </DialogContent>
      <DialogActions disableSpacing sx={{ flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          onClick={onClose}
          disabled={pending}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          loading={pending}
          ref={submitRef}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
