'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import {
  approveMembership,
  reactivateMembership,
  revokeMembership,
  suspendMembership,
} from '../membership-actions';
import type { UserStatus } from '../user-contract';
import type { MembershipAction } from '../user-rules';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  /** `null`: the activate endpoint reads no body (contract §E.3), so a ConfirmDialog. */
  reason: 'optional' | 'required' | null;
  /** Irreversible: an error-toned trigger and dialog. */
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
        reason: null,
        destructive: false,
        success: 'Approval recorded',
        action: approveMembership,
      };
    case 'reject':
      return {
        label: 'Reject & revoke',
        title: `Reject and revoke ${name}?`,
        description:
          'This is permanent. The membership is revoked, and this email can never be invited to this institution again.',
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
        description:
          'This is permanent. Every role and branch assignment here is revoked with it, and this email can never be invited to this institution again.',
        reason: 'required',
        destructive: true,
        success: 'Membership revoked',
        action: revokeMembership,
      };
  }
}

interface UserLifecycleActionsProps {
  /** `null` when the membership wasn't found: nothing can be sent, so only the note shows. */
  membershipId: string | null;
  userName: string;
  actions: readonly MembershipAction[];
  /** The offered actions that are contextually blocked, each with the caption that says why. */
  blocked: Partial<Record<MembershipAction, string>>;
  /** Why the hero has no actions the holder's codes suggest (Ruling 7). */
  note: string | null;
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
  userStatus,
  contextOrganisationId,
}: UserLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<MembershipAction | null>(null);
  const offered = membershipId === null ? [] : actions;
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // 08's I3: a successful transition swaps the whole action set (`refresh()`), unmounting the
  // trigger that had focus. `succeededRef` holds which action just succeeded, set only by a real
  // success below, so the effect runs the recovery once per transition. It keys on the set's
  // contents (`actionKey`), not the array: the server hands back a new array on every render.
  const succeededRef = useRef<string | null>(null);
  const actionKey = offered.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;

    // A blocked action is disabled and can't take focus (`focus()` on it is a no-op), so
    // "enabled" is read off the live DOM node, not re-derived from `blocked` here.
    const focusable = (id: string): HTMLButtonElement | null => {
      const node = buttonRefs.current.get(id);
      return node && node.isConnected && !node.disabled ? node : null;
    };
    const current = actionKey === '' ? [] : actionKey.split(',');
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
  }, [actionKey]);

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
    ...new Set([...offered.flatMap((id) => blocked[id] ?? []), ...(note ? [note] : [])]),
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
        {offered.map((id, index) => {
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
              aria-describedby={reason === undefined ? undefined : captionId(reason)}
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
      {membershipId !== null &&
        offered.map((id) => {
          const copy = copyFor(id, userName);
          const close = () => {
            setOpen(null);
          };
          const succeed = () => {
            succeededRef.current = id;
            setOpen(null);
            notify(copy.success);
          };
          if (copy.reason === null) {
            return (
              <ConfirmDialog
                key={id}
                open={open === id}
                title={copy.title}
                description={copy.description}
                confirmLabel={copy.label}
                tone={copy.destructive ? 'error' : 'primary'}
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
              confirmLabel={copy.label}
              reason={copy.reason}
              tone={copy.destructive ? 'error' : 'default'}
              action={copy.action}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
              fields={() => (
                <>
                  <input type="hidden" name="membershipId" value={membershipId} />
                  {id === 'reject' && (
                    // Layer 12, P-3: refused unless still pending, and unless the user is not
                    // provisioning now when this page showed one who was not (a 202 approval keeps
                    // the membership pending), so a stale tab never revokes someone another
                    // administrator approved meanwhile.
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
