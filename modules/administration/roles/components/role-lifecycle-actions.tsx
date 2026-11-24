'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import NextLink from '@/components/navigation/next-link';
import { useToast } from '@/components/providers/toast-provider';
import { activateRole, deactivateRole } from '../role-actions';
import type { RoleLifecycleAction } from '../role-rules';

interface RoleLifecycleActionsProps {
  roleId: string;
  roleName: string;
  /** The edit page, when the user may edit this custom role. */
  editHref?: string;
  /** `roleStatusAction`'s result: the one status toggle on offer, if any. */
  action: RoleLifecycleAction | null;
  /** Why the toggle can't be used here (you hold the role, #342): shown disabled with this. */
  blocked?: string;
  /** The signed-in user holds this role (`/auth/me` roles, or one role-assignment read for a
   * DISABLED role), so deactivating it affects them. */
  heldByMe: boolean;
  /** I2: the organisation the page rendered for; forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** Record hero actions (spec §10.4): Edit, plus Activate or Deactivate, custom roles only. */
export function RoleLifecycleActions({
  roleId,
  roleName,
  editHref,
  action,
  blocked,
  heldByMe,
  contextOrganisationId,
}: RoleLifecycleActionsProps) {
  const notify = useToast();
  const blockedId = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // I3: a successful toggle swaps the action after `refresh()`. The toggle keeps its DOM node when
  // its replacement is on offer (Deactivate ↔ Activate); otherwise focus falls back to the title.
  // `succeededRef` is set only by a real success, so an unrelated re-render never moves focus.
  const succeededRef = useRef(false);
  useEffect(() => {
    if (!succeededRef.current) return;
    succeededRef.current = false;
    // A blocked toggle is disabled and can't take focus.
    if (toggleRef.current?.isConnected && !toggleRef.current.disabled) toggleRef.current.focus();
    else focusRecordTitle();
  }, [action]);
  // When the success leaves nothing to render, the layout unmounts this component, so the same
  // fallback runs from an unmount cleanup. Aliasing the ref object lets the cleanup read the live
  // value (react-hooks/exhaustive-deps' documented fix, as in 08's BranchLifecycleActions).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  const deactivate = action === 'deactivate';
  const label = deactivate ? 'Deactivate' : 'Activate';

  return (
    <>
      <Box
        // As BranchLifecycleActions' box: its own flex-end context, so a full-width reason doesn't
        // leave the buttons at the left edge, with the hero's ≤ md sharing re-applied; the cap
        // (from md) wraps a long reason here instead of squeezing the title column.
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
        {editHref && (
          <Button
            component={NextLink}
            href={editHref}
            variant="outlined"
            startIcon={<EditOutlined />}
          >
            Edit
          </Button>
        )}
        {action && (
          <Button
            ref={toggleRef}
            variant={deactivate ? 'outlined' : 'contained'}
            color={deactivate ? 'error' : 'primary'}
            disabled={blocked !== undefined}
            aria-describedby={blocked === undefined ? undefined : blockedId}
            onClick={() => {
              setOpen(true);
            }}
          >
            {label}
          </Button>
        )}
        {action && blocked !== undefined && (
          // Visible text, not a tooltip: a disabled button can't take focus to reveal one.
          <Typography
            id={blockedId}
            variant="caption"
            sx={{
              color: 'text.secondary',
              flexBasis: '100%',
              textAlign: 'right',
              textWrap: 'pretty',
            }}
          >
            {blocked}
          </Typography>
        )}
      </Box>
      {action && (
        <ConfirmDialog
          // One dialog per action (08's per-action dialogs): when refresh() swaps the action, the
          // closing dialog unmounts instead of repainting mid-fade with the other action's copy.
          key={action}
          open={open}
          tone={deactivate ? 'error' : 'primary'}
          title={`${label} ${roleName}?`}
          description={
            deactivate
              ? `Everyone holding this role loses its permissions until it is activated again. Their assignments stay.${
                  heldByMe ? ' You hold this role yourself, so you lose them too.' : ''
                }`
              : 'Everyone assigned this role gets its permissions again.'
          }
          confirmLabel={label}
          action={deactivate ? deactivateRole : activateRole}
          contextOrganisationId={contextOrganisationId}
          onClose={() => {
            setOpen(false);
          }}
          onSuccess={() => {
            succeededRef.current = true;
            setOpen(false);
            notify(deactivate ? 'Role deactivated' : 'Role activated');
          }}
        >
          <input type="hidden" name="roleId" value={roleId} />
        </ConfirmDialog>
      )}
    </>
  );
}
