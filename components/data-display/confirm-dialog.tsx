'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

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
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <ConfirmForm {...form} onClose={onClose} onPendingChange={setPending} />
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
  children,
}: Omit<ConfirmDialogProps<Result>, 'open'> & { onPendingChange: (pending: boolean) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<Result | null, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.ok) onSuccess();
      return result;
    },
    null,
  );
  // Reported from an effect: a parent setState inside the action would be held back with the
  // transition until the action settles. Each mount reports `false`, so a reopened dialog can
  // always be closed again.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  // Narrow through the concrete union: a generic `Result` doesn't narrow on `ok`.
  const outcome: ConfirmOutcome | null = state;
  const failure = outcome && !outcome.ok ? outcome : null;

  return (
    <Box component="form" action={formAction}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        <DialogContentText>{description}</DialogContentText>
        {failure && (
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
