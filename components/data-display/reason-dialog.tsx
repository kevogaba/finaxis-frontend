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
  fields?: (fieldErrors: FieldErrors) => ReactNode;
}

const REASON_MAX = 500;
const NO_ERRORS: FieldErrors = {};

/**
 * Wraps `ReasonForm` in a `Dialog` that ignores Escape/backdrop while a submit is pending, so a
 * slow request can't be closed out from under itself and lose its idempotency key (D2).
 */
export function ReasonDialog({ open, onClose, ...form }: ReasonDialogProps) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <ReasonForm {...form} onClose={onClose} onPendingChange={setPending} />
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
  onPendingChange,
}: Omit<ReasonDialogProps, 'open'> & { onPendingChange: (pending: boolean) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.ok) onSuccess();
      return result;
    },
    null,
  );
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.fieldErrors ?? NO_ERRORS;

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
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
