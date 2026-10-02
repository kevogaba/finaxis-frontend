'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { useToast } from '@/components/providers/toast-provider';
import { fetchOrganisations, isSessionExpired } from '@/components/context/context-api';
import { ContextSelectionForm } from '@/components/context/context-selection-form';
import { ORGANISATION_DISCOVERY_ERROR } from '@/components/context/use-context-selection';
import type { SelectionOutcome } from '@/components/context/use-context-selection';
import { useApplicationContext } from './organization-context';

interface ContextSwitcherDialogProps {
  open: boolean;
  onClose: () => void;
  platformOrganisationId: string;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; organisations: BrowserPage<BrowserOrganisation> }
  | { kind: 'error' };

/** "Switch working context" (prototype ContextModal) over the shared selection form. */
export function ContextSwitcherDialog({
  open,
  onClose,
  platformOrganisationId,
}: ContextSwitcherDialogProps) {
  const router = useRouter();
  const notify = useToast();
  const current = useApplicationContext();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [committed, setCommitted] = useState<string | null>(null);
  // The branch endpoints clear the context cookie server-side on a 403/409 — once that happens the
  // ambient organisation/branch this dialog opened with is no longer pinned, so Close must stop
  // treating it as a completed switch and just let the shared layout notice on its own refresh.
  const [contextLost, setContextLost] = useState(false);
  const [organisationRetry, setOrganisationRetry] = useState(0);
  // Mirrors `open` for the async `onOrganisationCommitted`/`onOrganisationLost` callbacks below,
  // which fire from a promise continuation and need the dialog's *current* open state, not the one
  // closed over at click time.
  const openRef = useRef(open);

  const homeFor = (organisationId: string) =>
    organisationId === platformOrganisationId ? '/platform-admin' : '/admin';

  // ponytail: only searches the currently-loaded organisations page (page 0 on open), so an
  // organisation chosen from a later page gets an empty name in the toast below. Upgrade by
  // tracking the picked organisation's displayName alongside its id in `onOrganisationCommitted`
  // if that turns out to matter.
  const nameOf = (organisationId: string) =>
    load.kind === 'ready'
      ? (load.organisations.items.find((item) => item.organisationId === organisationId)
          ?.displayName ?? '')
      : '';

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      return;
    }
    let cancelled = false;
    fetchOrganisations(0)
      .then((organisations) => {
        if (!cancelled) setLoad({ kind: 'ready', organisations });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isSessionExpired(error)) {
          router.replace('/login?reason=session_expired');
          return;
        }
        setLoad({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, router, organisationRetry]);

  const reset = () => {
    setLoad({ kind: 'loading' });
    setCommitted(null);
    setContextLost(false);
  };

  const finish = (outcome: SelectionOutcome) => {
    // Already at All branches for the current organisation as far as this tab knows: no toast.
    // The refresh below still runs — the shared cookie may have moved in another tab (or an
    // earlier switch's refresh may still be in flight), and the select-organisation POST that led
    // here has just reset it, so the shell must re-read it rather than trust `current`.
    const unchanged =
      outcome.kind === 'institution' &&
      outcome.organisationId === current.organization.id &&
      current.branch === null;
    const name = nameOf(outcome.organisationId);
    reset();
    onClose();
    if (!unchanged) {
      notify(
        outcome.kind === 'institution'
          ? `Switched to ${name} · All branches`
          : `Switched to ${name}`,
      );
    }
    if (outcome.organisationId !== current.organization.id) {
      // A different organisation may still resolve to the same path (e.g. two tenant
      // organisations both land on `/admin`), which the Next router treats as a same-URL no-op —
      // so `refresh()` below is what actually forces the shared layout to re-read the new
      // context cookie, not this `push`.
      router.push(homeFor(outcome.organisationId));
    }
    router.refresh();
  };

  const close = () => {
    if (committed) {
      // The organisation token is already issued; without a branch the context is institution
      // level. `onOrganisationLost` always clears `committed` first, so a still-lost context never
      // reaches here — this only fires once a (possibly later) organisation POST has recovered it.
      finish({ kind: 'institution', organisationId: committed });
      return;
    }
    if (contextLost) {
      // No toast, no push: the context is already gone server-side, so a refresh is what lets the
      // shared layout notice and route to /select-context on its own.
      reset();
      onClose();
      router.refresh();
      return;
    }
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="context-switcher-title"
    >
      <DialogTitle id="context-switcher-title">
        <Typography
          variant="overline"
          component="span"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          Organisation and branch
        </Typography>
        Switch working context
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Typography color="text.secondary">
            Choosing an organisation or branch switches to it straight away. Available actions
            depend on your active membership and branch assignment; All branches lets multi-branch
            users administer every branch at institution level.
          </Typography>
          {load.kind === 'loading' && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Loading organisations…</Typography>
            </Stack>
          )}
          {load.kind === 'error' && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setLoad({ kind: 'loading' });
                    setOrganisationRetry((count) => count + 1);
                  }}
                >
                  Try again
                </Button>
              }
            >
              {ORGANISATION_DISCOVERY_ERROR}
            </Alert>
          )}
          {load.kind === 'ready' && (
            <ContextSelectionForm
              initialOrganisations={load.organisations}
              onComplete={finish}
              onOrganisationCommitted={(organisationId) => {
                // The dialog was closed mid-save (Close/Escape/backdrop, while the organisation
                // POST was still in flight): `committed` would land on a dialog nothing else
                // finishes, stranding the shell on the old organisation. Finish it now, at
                // institution level, per spec §6.5 (All branches). `finish` here is this render's
                // closure (captured while `load.kind === 'ready'`), so `nameOf` still has the
                // loaded organisations list to name the toast.
                // ponytail: if this organisation is also mid auto-pin, that pin can still resolve
                // afterwards and call `onComplete` -> `finish` a second time (the All-branches
                // toast, then the branch toast) — the final route/refresh is still correct either
                // way, so this double notify is left as-is.
                if (!openRef.current) {
                  finish({ kind: 'institution', organisationId });
                  return;
                }
                setCommitted(organisationId);
              }}
              onOrganisationLost={() => {
                setCommitted(null);
                if (!openRef.current) {
                  // Nothing to reset visually; just let the shared layout notice on its own refresh.
                  // ponytail: if the dialog was already closed mid-save and `onOrganisationCommitted`
                  // already ran `finish` (All-branches toast + push, same double-notify ceiling as
                  // above), the user sees that toast first and only then, once this later 403/409
                  // resolves, a silent refresh — which is what lets the layout notice the context is
                  // actually gone and route to /select-context. Upgrade by tracking a single
                  // in-flight generation id if a user ever reports the stale toast as confusing.
                  reset();
                  router.refresh();
                  return;
                }
                setContextLost(true);
              }}
              onSessionExpired={() => {
                router.replace('/login?reason=session_expired');
              }}
            />
          )}
          <Alert icon={<VerifiedUserOutlined fontSize="inherit" />} severity="info">
            Context switching is validated by the platform and never grants additional access.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={close}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
