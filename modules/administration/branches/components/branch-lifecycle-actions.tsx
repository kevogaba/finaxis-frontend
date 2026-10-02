'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import {
  activateBranch,
  closeBranch,
  reactivateBranch,
  submitBranch,
  suspendBranch,
} from '../branch-actions';
import { MAKER_CHECKER_BLOCKED, type BranchLifecycleAction } from '../branch-rules';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  reason: 'optional' | 'required';
  success: string;
  action: FormAction;
}

function copyFor(id: BranchLifecycleAction, name: string, selectedHere: boolean): ActionCopy {
  // A branch-selected context becomes invalid once its branch leaves ACTIVE (contract §E.4).
  const leavesContext = selectedHere
    ? ' You are working in this branch, so you will choose a working context again afterwards.'
    : '';
  switch (id) {
    case 'submit':
      return {
        label: 'Submit for approval',
        title: `Submit ${name} for approval?`,
        description: 'A different administrator must activate it before anyone can work in it.',
        reason: 'optional',
        success: 'Submitted for approval',
        action: submitBranch,
      };
    case 'activate':
      return {
        label: 'Activate',
        title: `Activate ${name}?`,
        description: 'The branch becomes available for user assignments and as a working context.',
        reason: 'optional',
        success: 'Branch activated',
        action: activateBranch,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: `Nobody can work in a suspended branch until it is reactivated.${leavesContext}`,
        reason: 'required',
        success: 'Branch suspended',
        action: suspendBranch,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'The branch becomes active again for its assigned users.',
        reason: 'optional',
        success: 'Branch reactivated',
        action: reactivateBranch,
      };
    case 'close':
      return {
        label: 'Close branch',
        title: `Close ${name}?`,
        description: `Closing is permanent. It is refused while users are still assigned here or child branches are active.${leavesContext}`,
        reason: 'required',
        success: 'Branch closed',
        action: closeBranch,
      };
  }
}

const BLOCKED_ID = 'branch-activate-blocked';

/**
 * I3's fallback (PF6) when a transition leaves no enabled trigger behind: RecordHero (frozen kit)
 * exposes no ref or id for its `<h1>`, so this finds it by DOM query and makes it a focus target.
 * ponytail: DOM-query ceiling — replace with a RecordHero focus-target prop (refactor(kit)) if
 * another record page needs the same fallback.
 */
export function focusRecordTitle(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

interface BranchLifecycleActionsProps {
  branchId: string;
  branchName: string;
  actions: readonly BranchLifecycleAction[];
  /** The current user drafted this branch (BG-08 lookup); Activate stays visible but disabled. */
  activateBlocked: boolean;
  /** This branch is the user's selected working context. */
  selectedHere: boolean;
  /** I2: the organisation the page rendered for; forwarded to `ReasonDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** Record hero lifecycle (spec §10.3): availability comes from `availableBranchActions`. */
export function BranchLifecycleActions({
  branchId,
  branchName,
  actions,
  activateBlocked,
  selectedHere,
  contextOrganisationId,
}: BranchLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<BranchLifecycleAction | null>(null);
  const blocked = activateBlocked && actions.includes('activate');
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // I3 (PF6): a successful transition swaps the whole action set (`refresh()`), unmounting the
  // trigger that had focus. `succeededRef` holds *which* action just succeeded, set only by a real
  // success in `onSuccess` below — never by an incidental re-render with the same actions — so the
  // effect runs the recovery exactly once per transition. Keyed on the set's contents (`actionKey`),
  // not the array: the server hands back a new array, same content, on every render.
  const succeededRef = useRef<string | null>(null);
  const actionKey = actions.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;

    // A disabled button (the drafter's own Activate) can't take focus — focus() on it is a no-op —
    // so "enabled" is read off the live DOM node, not re-derived from `activateBlocked` here.
    const focusable = (id: string): HTMLButtonElement | null => {
      const node = buttonRefs.current.get(id);
      return node && node.isConnected && !node.disabled ? node : null;
    };
    const currentActions = actionKey === '' ? [] : actionKey.split(',');
    let target = currentActions.includes(succeeded) ? focusable(succeeded) : null;
    for (const id of currentActions) {
      if (target) break;
      target = focusable(id);
    }
    if (target) {
      target.focus();
    } else {
      focusRecordTitle();
    }
  }, [actionKey]);

  // A success that empties the action set (Close → CLOSED) unmounts this component before the
  // effect above ever runs for an (absent) new render, so the same fallback runs from an unmount
  // cleanup instead. Aliasing the ref *object* here (not just reading `.current`) is what lets the
  // cleanup below read the *live* value at unmount time — react-hooks/exhaustive-deps flags a
  // direct `succeededRef.current` read inside a cleanup, and this is its documented fix, not a
  // disable.
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) {
        focusRecordTitle();
      }
    };
  }, []);

  return (
    <>
      <Box
        // V6: a bare Fragment here left RecordHero's own actions box sizing itself around the
        // blocked caption's flexBasis:100% with no justify-content set, so the button landed at
        // this box's left edge instead of the hero's right edge. This nested flex context gets
        // its own explicit flex-end, independent of the (frozen) kit box around it.
        // RecordHero's own box shares its row's width across its *direct* children at 375px
        // (`'& > *': { flexGrow: { xs: 1, md: 0 } }`, prototype ≤ md); this Box is now that only
        // direct child, so it re-applies the same rule to its own children (the buttons and the
        // caption) to keep that mobile sharing — the caption's flexBasis:100% already makes
        // flexGrow a no-op for it either way.
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          '& > *': { flexGrow: { xs: 1, md: 0 } },
        }}
      >
        {actions.map((id, index) => (
          <Button
            key={id}
            ref={(node) => {
              buttonRefs.current.set(id, node);
            }}
            variant={index === 0 ? 'contained' : 'outlined'}
            color={id === 'close' ? 'error' : 'primary'}
            disabled={id === 'activate' && blocked}
            aria-describedby={id === 'activate' && blocked ? BLOCKED_ID : undefined}
            onClick={() => {
              setOpen(id);
            }}
          >
            {copyFor(id, branchName, selectedHere).label}
          </Button>
        ))}
        {blocked && (
          // Visible text, not a tooltip: a disabled button can't take focus to reveal one.
          <Typography
            id={BLOCKED_ID}
            variant="caption"
            color="text.secondary"
            sx={{ flexBasis: '100%', textAlign: 'right' }}
          >
            {MAKER_CHECKER_BLOCKED}
          </Typography>
        )}
      </Box>
      {actions.map((id) => {
        const copy = copyFor(id, branchName, selectedHere);
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason}
            action={copy.action}
            tone={id === 'close' ? 'error' : 'default'}
            contextOrganisationId={contextOrganisationId}
            onClose={() => {
              setOpen(null);
            }}
            onSuccess={() => {
              succeededRef.current = id;
              setOpen(null);
              notify(copy.success);
            }}
            fields={() => <input type="hidden" name="branchId" value={branchId} />}
          />
        );
      })}
    </>
  );
}
