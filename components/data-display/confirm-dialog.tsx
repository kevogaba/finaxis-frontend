'use client';

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { unstable_rethrow } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

const ACTION_FAILED = 'Something went wrong. Please try again.';

/** The least a confirm action returns. PR 07's `ActionResult` fits; its extra failure fields are
 * ignored here. */
export type ConfirmOutcome =
  { ok: true } | { ok: false; formError: string; requestId?: string | null };

interface ConfirmDialogProps<Result extends ConfirmOutcome> {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** `error` for destructive or irreversible actions. */
  tone?: 'primary' | 'error';
  /** A Server Action; receives `idempotencyKey` plus any inputs rendered in `children`. */
  action: (previous: Result | null, formData: FormData) => Promise<Result>;
  onClose: () => void;
  /**
   * Called once the action succeeds. The consumer must close or unmount the dialog on success —
   * `ConfirmDialog` never does this itself, and a dialog left open keeps its idempotency key, so a
   * second submit after success would replay a spent key.
   */
  onSuccess: () => void;
  /** Under the description: a warning, or hidden inputs the action reads. */
  children?: ReactNode;
}

export function ConfirmDialog<Result extends ConfirmOutcome>({
  open,
  onClose,
  ...form
}: ConfirmDialogProps<Result>) {
  // Lifted from ConfirmForm: while the action is pending, Escape and a backdrop click must not
  // unmount the form, which would discard its idempotency key (spec §6.4).
  const [pending, setPending] = useState(false);
  // MUI's Dialog only wires aria-labelledby (from DialogTitle) on its own; a description needs an
  // explicit aria-describedby, and a destructive confirmation needs `role="alertdialog"`.
  const descriptionId = useId();
  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-describedby={descriptionId}
      role={form.tone === 'error' ? 'alertdialog' : undefined}
    >
      <ConfirmForm
        {...form}
        onClose={onClose}
        onPendingChange={setPending}
        descriptionId={descriptionId}
      />
    </Dialog>
  );
}

/**
 * Mounted once per opening (the dialog unmounts closed content), like PR 07's ReasonDialog: a
 * fresh idempotency key each time; a failed attempt keeps its key, so a retry replays safely
 * (spec §6.4).
 */
function ConfirmForm<Result extends ConfirmOutcome>({
  title,
  description,
  confirmLabel,
  tone = 'primary',
  action,
  onClose,
  onSuccess,
  onPendingChange,
  descriptionId,
  children,
}: Omit<ConfirmDialogProps<Result>, 'open'> & {
  onPendingChange: (pending: boolean) => void;
  descriptionId: string;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // The last real `Result` the action returned — never a synthesized failure — so a retry after a
  // rejected `action` (a network drop, a timeout, deploy skew) still passes the caller a `Result`,
  // never a bare `ConfirmOutcome` cast back with `as Result` (banned).
  const lastResult = useRef<Result | null>(null);
  const [state, formAction, pending] = useActionState<ConfirmOutcome | null, FormData>(
    async (_previous, formData) => {
      try {
        const result = await action(lastResult.current, formData);
        lastResult.current = result;
        if (result.ok) onSuccess();
        return result;
      } catch (caught) {
        // A harmless guard: Next's own control-flow errors (redirect()/notFound()) must keep
        // propagating rather than being swallowed as a form failure. A Server Action's redirect()
        // itself does a client-side navigation and never rejects here.
        unstable_rethrow(caught);
        // Never `caught.message`: an unhandled rejection (a network drop, a timeout, a server
        // restart, deploy skew) may carry backend or stack detail that isn't safe to show.
        return { ok: false, formError: ACTION_FAILED };
      }
    },
    null,
  );
  // Reported from an effect: a parent setState inside the action would be held back with the
  // transition until the action settles. Each mount reports `false`, so a reopened dialog can
  // always be closed again.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const failure = state && !state.ok ? state : null;

  return (
    <Box component="form" action={formAction}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <DialogContentText id={descriptionId}>{description}</DialogContentText>
        {failure && !pending && (
          <Alert severity="error">
            {failure.formError}
            {failure.requestId && ` Reference: ${failure.requestId}`}
          </Alert>
        )}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {children}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" color={tone} loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
