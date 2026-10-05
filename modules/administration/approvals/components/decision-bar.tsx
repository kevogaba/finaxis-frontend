'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { approveUser, rejectUser } from '../approval-actions';
import {
  ACTIVATED_TOAST,
  APPROVED_TOAST,
  decisionCopy,
  REJECTED_TOAST,
  type ApprovalOutcome,
  type ApproveResult,
} from '../approval-copy';
import type { ApprovalDecision } from '../approval-rules';
import { activatePendingBranch } from '../branch-activation-actions';

/** What the dialogs post: the membership or the branch the decision writes; the action reads its
 * state again by that id. `membershipId` is null when the page's lookup found none (no decision). */
export type DecisionSubject =
  { kind: 'membership'; membershipId: string | null } | { kind: 'branch'; branchId: string };

interface DecisionBarProps {
  subject: DecisionSubject;
  /** The person's or the branch's name, for the dialog titles. */
  name: string;
  decisions: readonly ApprovalDecision[];
  /** The offered decisions shown disabled, each with the caption that says why. */
  blocked: Partial<Record<ApprovalDecision, string>>;
  /** Why the bar offers less than the holder's codes suggest (no `membership.view`, …). */
  note: string | null;
  /** I2: the organisation the page rendered for; forwarded to every dialog as a hidden field. */
  contextOrganisationId: string;
}

function successToast(decision: ApprovalDecision, outcome: ApprovalOutcome): string {
  switch (decision) {
    case 'approve':
      return APPROVED_TOAST[outcome];
    case 'reject':
      return REJECTED_TOAST;
    case 'activate':
      return ACTIVATED_TOAST;
  }
}

/** The decision bar (spec §10.6) in the record hero: Approve and Reject & revoke for a user,
 * Activate for a branch. Primitive props only, so the Server Component page can render it. */
export function DecisionBar({
  subject,
  name,
  decisions,
  blocked,
  note,
  contextOrganisationId,
}: DecisionBarProps) {
  const notify = useToast();
  const [open, setOpen] = useState<ApprovalDecision | null>(null);
  const offered = subject.kind === 'membership' && subject.membershipId === null ? [] : decisions;
  // Ruling 10: the approval's echo says which way it went; the wrapper below keeps it for the toast.
  const outcomeRef = useRef<ApprovalOutcome>('recorded');
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // As 10's UserLifecycleActions: a successful decision swaps the page's state (`refresh()`), so
  // focus goes to the same decision if still offered, else the first enabled one, else the record
  // title. `succeededRef` is set only by a real success, so this runs once per decision.
  const succeededRef = useRef<string | null>(null);
  const decisionKey = offered.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;
    const focusable = (id: string): HTMLButtonElement | null => {
      const node = buttonRefs.current.get(id);
      return node && node.isConnected && !node.disabled ? node : null;
    };
    const current = decisionKey === '' ? [] : decisionKey.split(',');
    let target = current.includes(succeeded) ? focusable(succeeded) : null;
    for (const id of current) {
      if (target) break;
      target = focusable(id);
    }
    if (target) {
      target.focus();
    } else {
      focusRecordTitle();
    }
  }, [decisionKey]);

  // Every decision empties the bar, which unmounts this component before the effect above runs
  // again, so the record title takes focus from this cleanup instead (10's pattern).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) focusRecordTitle();
    };
  }, []);

  const approve = async (
    previous: ApproveResult | null,
    formData: FormData,
  ): Promise<ApproveResult> => {
    const result = await approveUser(previous, formData);
    if (result.ok) outcomeRef.current = result.outcome;
    return result;
  };

  // Visible text, not a tooltip: a disabled button can't take focus to reveal one.
  const captions = [
    ...new Set([...offered.flatMap((id) => blocked[id] ?? []), ...(note ? [note] : [])]),
  ];
  const captionId = (text: string) => `approval-decision-caption-${captions.indexOf(text)}`;
  const hiddenFields =
    subject.kind === 'membership' ? (
      <input type="hidden" name="membershipId" value={subject.membershipId ?? ''} />
    ) : (
      <input type="hidden" name="branchId" value={subject.branchId} />
    );

  return (
    <>
      <Box
        // 10's hero box: buttons at the right edge, the captions under them, and a cap from md so a
        // long caption wraps here instead of squeezing the title column.
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          maxWidth: { md: 320 },
          '& > *': { flexGrow: { xs: 1, md: 0 } },
        }}
      >
        {offered.map((id, index) => {
          const reason = blocked[id];
          const copy = decisionCopy(id, name);
          return (
            <Button
              key={id}
              ref={(node) => {
                buttonRefs.current.set(id, node);
              }}
              variant={index === 0 ? 'contained' : 'outlined'}
              color={copy.destructive ? 'error' : 'primary'}
              disabled={reason !== undefined}
              aria-describedby={reason === undefined ? undefined : captionId(reason)}
              onClick={() => {
                setOpen(id);
              }}
              // Never wraps: "Reject & revoke" stays one label beside a 100-character name.
              sx={{ whiteSpace: 'nowrap' }}
            >
              {copy.label}
            </Button>
          );
        })}
        {captions.map((text, index) => (
          <Typography
            key={text}
            variant="caption"
            id={`approval-decision-caption-${index}`}
            sx={{
              color: 'text.secondary',
              flexBasis: '100%',
              textAlign: 'right',
              textWrap: 'pretty',
            }}
          >
            {text}
          </Typography>
        ))}
      </Box>
      {offered.map((id) => {
        const copy = decisionCopy(id, name);
        const close = () => {
          setOpen(null);
        };
        const succeed = () => {
          succeededRef.current = id;
          setOpen(null);
          notify(successToast(id, outcomeRef.current));
        };
        if (id === 'approve') {
          return (
            <ConfirmDialog
              key={id}
              open={open === id}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.label}
              action={approve}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
            >
              {hiddenFields}
            </ConfirmDialog>
          );
        }
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason ?? 'optional'}
            tone={copy.destructive ? 'error' : 'default'}
            action={id === 'reject' ? rejectUser : activatePendingBranch}
            contextOrganisationId={contextOrganisationId}
            onClose={close}
            onSuccess={succeed}
            fields={() => hiddenFields}
          />
        );
      })}
    </>
  );
}
