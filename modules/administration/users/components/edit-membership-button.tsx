'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { updateMembership } from '../membership-actions';
import { EDITABLE_MEMBERSHIP_TYPES, type EditableMembershipType } from '../user-contract';
import { EDIT_MEMBERSHIP_DESCRIPTION, type SelectOption } from '../user-rules';

interface EditMembershipButtonProps {
  membershipId: string;
  userName: string;
  /** The membership as the page read it: each field opens on it, and only a change is sent. */
  membershipType: EditableMembershipType;
  primaryBranchId: string | null;
  /** The Primary branch options besides None, the current one included (the page adds it when the
   * ACTIVE branches it read don't hold it). */
  branches: readonly SelectOption[];
  /** Under the Primary branch field: what it is, and how much of the institution is listed. */
  branchHint: string;
  /** I2: the organisation the page rendered for; forwarded to the dialog as a hidden field. */
  contextOrganisationId?: string;
}

/** The Membership card's Edit membership (BG-17): the type and the primary branch, two fields, so
 * ReasonDialog's `useActionState` with native constraints and no reason (AGENTS.md). Its own
 * membership included: the platform has no self rule here. */
export function EditMembershipButton({
  membershipId,
  userName,
  membershipType,
  primaryBranchId,
  branches,
  branchHint,
  contextOrganisationId,
}: EditMembershipButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<EditOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Edit membership
      </Button>
      <ReasonDialog
        open={open}
        title={`Edit ${userName}'s membership`}
        description={EDIT_MEMBERSHIP_DESCRIPTION}
        confirmLabel="Save"
        reason="none"
        action={updateMembership}
        contextOrganisationId={contextOrganisationId}
        onClose={close}
        onSuccess={() => {
          close();
          notify('Membership updated');
        }}
        fields={(fieldErrors) => (
          <>
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="currentMembershipType" value={membershipType} />
            <input type="hidden" name="currentPrimaryBranchId" value={primaryBranchId ?? ''} />
            <TextField
              select
              name="membershipType"
              label="Membership type"
              required
              defaultValue={membershipType}
              error={Boolean(fieldErrors.membershipType)}
              helperText={fieldErrors.membershipType}
            >
              {EDITABLE_MEMBERSHIP_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {humanizeEnum(type)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              name="primaryBranchId"
              label="Primary branch"
              defaultValue={primaryBranchId ?? ''}
              error={Boolean(fieldErrors.primaryBranchId)}
              helperText={fieldErrors.primaryBranchId ?? branchHint}
              // None shows its word, not a blank field; the theme always shrinks the label above.
              slotProps={{ select: { displayEmpty: true } }}
            >
              <MenuItem value="">None</MenuItem>
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.label}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      />
    </>
  );
}
