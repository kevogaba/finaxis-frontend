'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
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
  /** The signed-in user holds this role (`/auth/me` roles), so deactivating it affects them. */
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
  heldByMe,
  contextOrganisationId,
}: RoleLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // I3: a successful toggle swaps the action after `refresh()`. The toggle keeps its DOM node when
  // its replacement is on offer (Deactivate ↔ Activate); otherwise focus falls back to the title.
  // `succeededRef` is set only by a real success, so an unrelated re-render never moves focus.
  const succeededRef = useRef(false);
  useEffect(() => {
    if (!succeededRef.current) return;
    succeededRef.current = false;
    if (toggleRef.current?.isConnected) toggleRef.current.focus();
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
        <>
          <Button
            ref={toggleRef}
            variant={deactivate ? 'outlined' : 'contained'}
            color={deactivate ? 'error' : 'primary'}
            onClick={() => {
              setOpen(true);
            }}
          >
            {label}
          </Button>
          <ConfirmDialog
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
        </>
      )}
    </>
  );
}
