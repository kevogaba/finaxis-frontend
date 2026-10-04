'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import { deactivateAccount, reactivateAccount, suspendAccount } from '../account-actions';
import type { AccountAction } from '../account-rules';

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  reason: 'optional' | 'required';
  /** Irreversible: an error-toned trigger and an alertdialog. */
  destructive: boolean;
  success: string;
  action: FormAction;
}

/** Every copy names the whole platform: the account is global, never one institution's (Ruling 5). */
function copyFor(id: AccountAction, name: string): ActionCopy {
  switch (id) {
    case 'suspend':
      return {
        label: 'Suspend account',
        title: `Suspend ${name}'s account?`,
        description:
          "This suspends their sign-in account on the whole platform: they can't sign in to any institution they belong to until a platform administrator reactivates it.",
        reason: 'required',
        destructive: false,
        success: 'Account suspended',
        action: suspendAccount,
      };
    case 'reactivate':
      return {
        label: 'Reactivate account',
        title: `Reactivate ${name}'s account?`,
        description:
          'They can sign in again to every institution where their membership is active.',
        reason: 'optional',
        destructive: false,
        success: 'Account reactivated',
        action: reactivateAccount,
      };
    case 'deactivate':
      return {
        label: 'Deactivate account',
        title: `Deactivate ${name}'s account?`,
        description:
          "This is permanent: the platform can't reactivate a deactivated account. They lose access to every institution they belong to, and their role assignments are revoked.",
        reason: 'required',
        destructive: true,
        success: 'Account deactivated',
        action: deactivateAccount,
      };
  }
}

interface AccountLifecycleActionsProps {
  userId: string;
  userName: string;
  /** Typed back to confirm Deactivate; the Server Action compares it with what the form sends. */
  username: string;
  actions: readonly AccountAction[];
  /** The offered actions that are contextually blocked, each with the caption that says why. */
  blocked: Partial<Record<AccountAction, string>>;
  /** Why the hero has no action the holder's codes suggest (Ruling 5). */
  note: string | null;
  /** I2: the organisation the page rendered for; forwarded to each dialog as a hidden field. */
  contextOrganisationId?: string;
}

/** The record hero's global account lifecycle (spec §11.2, §11.3): availability comes from
 * `availableAccountActions`, the blocked ones from `blockedAccountActions`. */
export function AccountLifecycleActions({
  userId,
  userName,
  username,
  actions,
  blocked,
  note,
  contextOrganisationId,
}: AccountLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<AccountAction | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // 08's I3: a successful transition swaps the whole action set (`refresh()`), unmounting the
  // trigger that had focus. `succeededRef` holds which action just succeeded, set only by a real
  // success below, so the effect runs the recovery once per transition. It keys on the set's
  // contents (`actionKey`), not the array: the server hands back a new array on every render.
  const succeededRef = useRef<string | null>(null);
  const actionKey = actions.join(',');

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

  // A success that leaves neither an action nor a note unmounts this component (AccountRecord drops
  // it), so the same fallback runs from the cleanup instead. After Deactivate the note keeps it
  // mounted, and the effect above moves focus to the title. Aliasing the ref object reads its live
  // value at unmount time, which react-hooks/exhaustive-deps allows.
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
  const captionId = (text: string) => `account-action-blocked-${captions.indexOf(text)}`;

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
            id={`account-action-blocked-${index}`}
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
            onClose={() => {
              setOpen(null);
            }}
            onSuccess={() => {
              succeededRef.current = id;
              setOpen(null);
              notify(copy.success);
            }}
            fields={(fieldErrors) => (
              <>
                <input type="hidden" name="userId" value={userId} />
                {id === 'deactivate' && (
                  <>
                    <input type="hidden" name="username" value={username} />
                    <TextField
                      name="confirmUsername"
                      label={
                        <>
                          Type{' '}
                          <Box component="code" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            {username}
                          </Box>{' '}
                          to confirm
                        </>
                      }
                      required
                      error={Boolean(fieldErrors.confirmUsername)}
                      helperText={
                        fieldErrors.confirmUsername ?? 'Their username, exactly as shown.'
                      }
                      slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
                    />
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
