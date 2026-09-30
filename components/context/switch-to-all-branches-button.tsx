'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useToast } from '@/components/providers/toast-provider';
import { useApplicationContext } from '@/components/shell/organization-context';
import { ALL_BRANCHES_UNAVAILABLE } from './all-branches-copy';
import {
  isContextLost,
  isSessionExpired,
  selectBranchRequest,
  selectOrganisationRequest,
} from './context-api';
import { nextStepAfterOrganisation } from './use-context-selection';

const SWITCH_FAILED = "We couldn't switch to All branches. Please try again.";
const CONTEXT_ACCESS_DENIED = 'You do not have access to this context.';
const STALE_CONTEXT = 'Your saved context is no longer valid. Select an organisation again.';

/** `info` when All branches is unavailable (informational), `error` when the switch failed. */
interface SwitchMessage {
  severity: 'info' | 'error';
  text: string;
}

/**
 * The guided state's action (spec §6.5): re-selecting the current organisation issues an
 * institution-level token for a multi-branch user — the same move as the context dialog's "All
 * branches". A single distinct branch ends up pinned again, as context selection always does.
 * Pages that know the user has one branch pass `allBranchesAvailable={false}` to
 * `BranchContextState`, so this fallback only runs on stale data.
 */
export function SwitchToAllBranchesButton() {
  const router = useRouter();
  const notify = useToast();
  const { organization } = useApplicationContext();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SwitchMessage | null>(null);

  const switchToAllBranches = async () => {
    setPending(true);
    setMessage(null);
    // Once the organisation POST succeeds, the server context has moved (the backend issued a new
    // token), even if the re-pin below fails.
    let committed = false;
    try {
      const selection = await selectOrganisationRequest(organization.id);
      committed = true;
      const step = nextStepAfterOrganisation(selection);
      if (typeof step === 'object') {
        await selectBranchRequest(step.autoSelect);
      }
      if (step === 'done-branch' || typeof step === 'object') {
        setMessage({ severity: 'info', text: ALL_BRANCHES_UNAVAILABLE });
      } else {
        notify(`Switched to ${organization.name} · All branches`);
      }
      router.refresh();
    } catch (caught) {
      if (isSessionExpired(caught)) {
        router.replace('/login?reason=session_expired');
        return;
      }
      // The backend clears the context cookie server-side on a lost context (403/409): whichever
      // call hit it, there is nothing left to retry against, so refresh and explain it precisely
      // rather than the generic failure below.
      if (isContextLost(caught)) {
        setMessage({
          severity: 'error',
          text: caught.status === 403 ? CONTEXT_ACCESS_DENIED : STALE_CONTEXT,
        });
        router.refresh();
        return;
      }
      // As use-context-selection.ts does: the header and the page re-read the context that the
      // server now holds, whether the re-pin failed with anything else or the organisation POST
      // never committed at all.
      if (committed) router.refresh();
      setMessage({ severity: 'error', text: SWITCH_FAILED });
    } finally {
      setPending(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
      <Button
        variant="contained"
        loading={pending}
        onClick={() => {
          void switchToAllBranches();
        }}
      >
        Switch to All branches
      </Button>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
    </Box>
  );
}
