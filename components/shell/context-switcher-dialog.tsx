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
  // Mirrors `open` for the async `onOrganisationCommitted` callback below, which fires from a
  // promise continuation and needs the dialog's *current* open state, not the one closed over at
  // click time.
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
  }, [open, router]);

  const reset = () => {
    setLoad({ kind: 'loading' });
    setCommitted(null);
  };

  const finish = (outcome: SelectionOutcome) => {
    const name = nameOf(outcome.organisationId);
    reset();
    onClose();
    notify(
      outcome.kind === 'institution' ? `Switched to ${name} · All branches` : `Switched to ${name}`,
    );
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
      // The organisation token is already issued; without a branch the context is institution level.
      finish({ kind: 'institution', organisationId: committed });
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
            Available actions depend on your active membership and branch assignment. All branches
            lets multi-branch users administer every branch at institution level.
          </Typography>
          {load.kind === 'loading' && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Loading organisations…</Typography>
            </Stack>
          )}
          {load.kind === 'error' && (
            <Alert severity="error">We couldn&apos;t load organisations. Please try again.</Alert>
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
