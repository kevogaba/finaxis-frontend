'use client';

import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import {
  APPROVAL_REMARK,
  REJECT_AND_REVOKE_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  approveMembership,
  reactivateMembership,
  resendInvitation,
  retryInvitation,
  revokeMembership,
  suspendMembership,
} from '../membership-actions';
import type { UserStatus } from '../user-contract';
import type { MembershipAction } from '../user-rules';

/** The self-approval note, which describes the decision it relaxes. */
const WARNING_ID = 'user-lifecycle-warning';

interface ActionCopy {
  label: string;
  /** The dialog's confirm button, when it isn't the trigger's label. */
  confirmLabel?: string;
  title: string;
  description: string;
  /** `none`: a confirmation with no field (ConfirmDialog), for Retry and Resend, which take no
   * body (BG-11). */
  reason: 'optional' | 'required' | 'none';
  /** The reason field's label and helper text, when not "Reason" (Approve's remark). */
  reasonLabel?: string;
  reasonHelperText?: string;
  /** Destructive: an error-toned trigger and dialog. */
  destructive: boolean;
  success: string;
  action: FormAction;
}

function copyFor(id: MembershipAction, name: string): ActionCopy {
  switch (id) {
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Their membership becomes active once their sign-in identity is ready. If they don't have one yet, it is created first and the invitation is sent when it completes.",
        reason: 'optional',
        ...APPROVAL_REMARK,
        destructive: false,
        success: 'Approval recorded',
        action: approveMembership,
      };
    case 'retry':
      return {
        label: 'Retry provisioning',
        confirmLabel: 'Retry',
        title: `Retry identity provisioning for ${name}?`,
        description: "We'll ask the identity provider to create their account again.",
        reason: 'none',
        destructive: false,
        success: 'Provisioning retried',
        action: retryInvitation,
      };
    case 'resend':
      return {
        label: 'Resend invitation',
        confirmLabel: 'Resend',
        title: `Resend ${name}'s invitation?`,
        description:
          'The identity provider emails them a new link to verify their address and set a password. The link lasts 72 hours. Delivery depends on how the platform is set up.',
        reason: 'none',
        destructive: false,
        success: 'Invitation resent',
        action: resendInvitation,
      };
    case 'reject':
      return {
        label: 'Reject & revoke',
        title: `Reject and revoke ${name}?`,
        description: REJECT_AND_REVOKE_DESCRIPTION,
        reason: 'required',
        destructive: true,
        success: 'Membership revoked',
        action: revokeMembership,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: "They can't sign in to this institution until the membership is reactivated.",
        reason: 'required',
        destructive: false,
        success: 'Membership suspended',
        action: suspendMembership,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'They can sign in to this institution again.',
        reason: 'optional',
        destructive: false,
        success: 'Membership reactivated',
        action: reactivateMembership,
      };
    case 'revoke':
      return {
        label: 'Revoke',
        title: `Revoke ${name}'s membership?`,
        // BG-28: a revoked member can be invited again, on the same membership.
        description: `${name} loses access to this institution, and every role and branch assignment here is revoked with it. They can be invited again later.`,
        reason: 'required',
        destructive: true,
        success: 'Membership revoked',
        action: revokeMembership,
      };
  }
}

interface UserLifecycleActionsProps {
  /** From the user read, which always carries it (BG-09). */
  membershipId: string;
  userName: string;
  actions: readonly MembershipAction[];
  /** The offered actions that are contextually blocked, each with the caption that says why. */
  blocked: Partial<Record<MembershipAction, string>>;
  /** Why the hero has no actions the holder's codes suggest (Ruling 7). */
  note: string | null;
  /** Said above the actions: the inviter approving while maker-checker is off (BG-08). */
  warning?: string | null;
  /** The user's account status as the page rendered it. Reject & revoke sends it back so the action
   * can tell a 202 approval (user now provisioning, membership still pending) from a stale tab. */
  userStatus?: UserStatus;
  /** I2: the organisation the page rendered for; forwarded to each dialog as a hidden field. */
  contextOrganisationId?: string;
}

/** The record hero's membership lifecycle (spec §10.5): availability comes from
 * `availableMembershipActions`, the blocked ones from `blockedMembershipActions`. */
export function UserLifecycleActions({
  membershipId,
  userName,
  actions,
  blocked,
  note,
  warning = null,
  userStatus,
  contextOrganisationId,
}: UserLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<MembershipAction | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // 08's I3: a successful transition swaps the whole action set (`refresh()`), unmounting the
  // trigger that had focus. `succeededRef` holds the action that just succeeded and the set it was
  // offered in, set only by a real success below. The refresh hands this component a new `actions`
  // array (the server's props, even for the same set; nothing on the client re-creates it), so the
  // effect below runs once per refresh, and the first after a success consumes it. Focus moves only
  // when that refresh changed the set. One that left it alone (Resend) keeps focus on the trigger,
  // which the closing dialog restores, and leaves nothing for a later refresh, or leaving the
  // record, to act on.
  const succeededRef = useRef<{ id: MembershipAction; offered: string } | null>(null);
  const actionKey = actions.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;
    const current = [...actions];
    if (current.join(',') === succeeded.offered) return;

    // A blocked action is disabled and can't take focus (`focus()` on it is a no-op), so
    // "enabled" is read off the live DOM node, not re-derived from `blocked` here.
    const focusable = (id: string): HTMLButtonElement | null => {
      const node = buttonRefs.current.get(id);
      return node && node.isConnected && !node.disabled ? node : null;
    };
    let target = current.includes(succeeded.id) ? focusable(succeeded.id) : null;
    for (const id of current) {
      if (target) break;
      target = focusable(id);
    }
    if (target) {
      target.focus();
    } else {
      focusRecordTitle();
    }
  }, [actions]);

  // A success that empties the set (Reject, Revoke) unmounts this component before the effect
  // above runs for a new render, so the same fallback runs from the cleanup instead. Aliasing the
  // ref object reads its live value at unmount time, which react-hooks/exhaustive-deps allows.
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) focusRecordTitle();
    };
  }, []);

  // One caption per distinct reason, then the note: visible text, not a tooltip, because a
  // disabled button can't take focus to reveal one.
  const captions = [
    ...new Set([...actions.flatMap((id) => blocked[id] ?? []), ...(note ? [note] : [])]),
  ];
  const captionId = (text: string) => `user-action-blocked-${captions.indexOf(text)}`;

  return (
    <>
      <Box
        // The nested flex context RecordHero's own actions box needs (08's V6): an explicit
        // flex-end so a full-width caption doesn't leave the buttons at the left edge, and the
        // hero's mobile rule (`'& > *': flexGrow`, ≤ md) re-applied to this box's children. The cap
        // (from md, where the hero is a row) makes a long caption wrap here: uncapped, its one-line
        // width sized this box and squeezed the title column, so the name wrapped and the email
        // broke mid-word.
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
        {warning && actions.length > 0 && (
          <Alert id={WARNING_ID} severity="warning" role="note" sx={{ flexBasis: '100%' }}>
            {warning}
          </Alert>
        )}
        {actions.map((id, index) => {
          const reason = blocked[id];
          return (
            <Button
              key={id}
              ref={(node) => {
                buttonRefs.current.set(id, node);
              }}
              variant={index === 0 ? 'contained' : 'outlined'}
              color={copyFor(id, userName).destructive ? 'error' : 'primary'}
              disabled={reason !== undefined}
              aria-describedby={
                reason !== undefined
                  ? captionId(reason)
                  : // The self-approval note describes the decision it relaxes.
                    warning && id === 'approve'
                    ? WARNING_ID
                    : undefined
              }
              onClick={() => {
                setOpen(id);
              }}
            >
              {copyFor(id, userName).label}
            </Button>
          );
        })}
        {captions.map((text, index) => (
          <Typography
            key={text}
            variant="caption"
            id={`user-action-blocked-${index}`}
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
      {actions.map((id) => {
        const copy = copyFor(id, userName);
        const close = () => {
          setOpen(null);
        };
        const succeed = () => {
          succeededRef.current = { id, offered: actionKey };
          setOpen(null);
          notify(copy.success);
        };
        if (copy.reason === 'none') {
          return (
            <ConfirmDialog
              key={id}
              open={open === id}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.confirmLabel ?? copy.label}
              action={copy.action}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
            >
              <input type="hidden" name="membershipId" value={membershipId} />
            </ConfirmDialog>
          );
        }
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.confirmLabel ?? copy.label}
            reason={copy.reason}
            reasonLabel={copy.reasonLabel}
            reasonHelperText={copy.reasonHelperText}
            tone={copy.destructive ? 'error' : 'default'}
            action={copy.action}
            contextOrganisationId={contextOrganisationId}
            onClose={close}
            onSuccess={succeed}
            fields={() => (
              <>
                <input type="hidden" name="membershipId" value={membershipId} />
                {id === 'reject' && (
                  // Layer 12, P-3: the action refuses it once the membership moved on (approved
                  // with a 200, suspended) and, when this page showed a user who was not
                  // provisioning, once the user is provisioning (a 202 approval keeps the
                  // membership pending). A membership already revoked goes through, so a
                  // same-key retry replays.
                  <>
                    <input type="hidden" name="expectedStatus" value="PENDING_APPROVAL" />
                    {userStatus && (
                      <input type="hidden" name="expectedUserStatus" value={userStatus} />
                    )}
                  </>
                )}
              </>
            )}
          />
        );
      })}
    </>
  );
}
