'use client';

import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { UserPicker } from '@/modules/administration/users/components/user-picker';
import { assignBranchUser, revokeBranchAssignment } from '../branch-actions';
import { BRANCH_ASSIGNMENT_TYPES } from '../branch-contract';

interface AssignBranchUserButtonProps {
  branchId: string;
  branchName: string;
  /** Left out of the user search: the signed-in user, where they can't add to their own access
   * (#342). */
  excludeUserId?: string;
  /** I2: the organisation the page rendered for; forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

export function AssignBranchUserButton({
  branchId,
  branchName,
  excludeUserId,
  contextOrganisationId,
}: AssignBranchUserButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<PersonAddAltOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Assign user
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign a user"
        description={`Give a user access to ${branchName}. The assignment takes effect immediately.`}
        submitLabel="Assign user"
        action={assignBranchUser}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('User assigned');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="branchId" value={branchId} />
            <UserPicker
              name="userId"
              label="User"
              required
              error={fieldErrors.userId}
              excludeUserId={excludeUserId}
            />
            <TextField
              select
              name="assignmentType"
              label="Assignment type"
              required
              defaultValue="OPERATE"
              error={Boolean(fieldErrors.assignmentType)}
              helperText={fieldErrors.assignmentType ?? 'A label only — it grants no permissions.'}
            >
              {BRANCH_ASSIGNMENT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {humanizeEnum(type)}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RevokeAssignmentButtonProps {
  assignmentId: string;
  userLabel: string;
  typeLabel: string;
  /**
   * Names the branch when the row doesn't make it obvious: a user's assignments differ by branch
   * (WCAG 2.4.6), so the Users tab passes it. Without it every string is as the branch page had it.
   */
  branchLabel?: string;
  /** The signed-in user's own assignment: revoking it may end their selected context (BG-35). */
  self?: boolean;
  /** I2: the organisation the page rendered for; forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

export function RevokeAssignmentButton({
  assignmentId,
  userLabel,
  typeLabel,
  branchLabel,
  self = false,
  contextOrganisationId,
}: RevokeAssignmentButtonProps) {
  const notify = useToast();
  const at = branchLabel ? ` at ${branchLabel}` : '';
  const branch = branchLabel ?? 'this branch';
  const [open, setOpen] = useState(false);
  // I3 (PF6): a successful revoke removes this row — and this component — on the next render, so
  // the fallback always runs from the unmount cleanup. See branch-lifecycle-actions.tsx's own
  // comment for why `.current` is read through a local alias here rather than directly.
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) {
        focusRecordTitle();
      }
    };
  }, []);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`Revoke ${userLabel}'s ${typeLabel} assignment${at}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        tone="error"
        title={
          self
            ? branchLabel
              ? `Revoke your own ${branchLabel} assignment?`
              : 'Revoke your own assignment at this branch?'
            : `Revoke ${userLabel}'s assignment${at}?`
        }
        description={`${userLabel} loses the ${typeLabel} assignment at ${branch} immediately.`}
        confirmLabel="Revoke"
        action={revokeBranchAssignment}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Assignment revoked');
        }}
      >
        {self && (
          <Alert severity="warning">
            {`This is your own access. If ${branch} is your selected branch, you'll be asked to choose your context again.`}
          </Alert>
        )}
        <input type="hidden" name="assignmentId" value={assignmentId} />
      </ConfirmDialog>
    </>
  );
}
