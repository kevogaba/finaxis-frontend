'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { unstable_rethrow } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import type { ActionResult, FormAction } from '@/lib/api/action-result';

type FieldErrors = Partial<Record<string, string>>;
const NO_ERRORS: FieldErrors = {};
const SUBMIT_FAILED =
  "We couldn't confirm this change. Try again; it's safe to retry. If it keeps failing, reload the page.";

interface AssignmentDrawerProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  /** A Server Action; receives `idempotencyKey` plus whatever `children` renders. */
  action: FormAction;
  onClose: () => void;
  onSuccess: () => void;
  /** The assignment's fields (and hidden inputs for fixed IDs), given the server's field errors. */
  children: (fieldErrors: FieldErrors) => ReactNode;
  /**
   * The organisation the page rendered for, carried as a hidden input so a Server Action can
   * refuse a stale submit after the user switched organisation in another tab (I2).
   */
  contextOrganisationId?: string;
}

/** Right-anchored assignment form (spec §9): user/role/branch assignment across 08–10.
 *
 * Wraps `AssignmentForm` in a `Drawer` that ignores Escape/backdrop while a submit is pending, so
 * a slow request can't be closed out from under itself and lose its idempotency key (D2).
 */
export function AssignmentDrawer({ open, onClose, ...form }: AssignmentDrawerProps) {
  const [pending, setPending] = useState(false);
  const titleId = useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={pending ? undefined : onClose}
      // The temporary Drawer's paper already has role="dialog" + aria-modal; add the name.
      slotProps={{ paper: { 'aria-labelledby': titleId, sx: { width: { xs: '100%', sm: 440 } } } }}
    >
      <AssignmentForm {...form} onClose={onClose} onPendingChange={setPending} titleId={titleId} />
    </Drawer>
  );
}

/**
 * Mounted once per opening (the Drawer unmounts closed content), like ReasonDialog: a fresh key
 * each time; a failed attempt keeps it, so a retry replays safely (spec §6.4).
 */
function AssignmentForm({
  titleId,
  title,
  description,
  submitLabel,
  action,
  onClose,
  onSuccess,
  children,
  contextOrganisationId,
  onPendingChange,
}: Omit<AssignmentDrawerProps, 'open'> & {
  titleId: string;
  onPendingChange: (pending: boolean) => void;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
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
  // Reported from an effect, like ReasonDialog/ConfirmDialog: a parent setState inside the action
  // would be held back with the transition until the action settles. Each mount reports `false`,
  // so a reopened drawer can always be closed again.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const failure = state && !state.ok ? state : null;

  // `<form action={formAction}>` makes React reset every uncontrolled field (whatever `children`
  // renders) via requestFormReset on every submit, success or failure (react-dom's
  // startHostTransition calls it before running the action). Dispatching `formAction` ourselves
  // from onSubmit never goes through that DOM-action-prop wiring, so a retry after a failure keeps
  // what the user typed; native constraint validation still runs before `submit` fires.
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ px: 4.5, py: 3.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id={titleId} component="h2" variant="h4">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ p: 4.5, flexGrow: 1, display: 'grid', alignContent: 'start', gap: 4 }}>
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
        {children(failure?.fieldErrors ?? NO_ERRORS)}
      </Box>
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          px: 4.5,
          py: 3,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={pending}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
