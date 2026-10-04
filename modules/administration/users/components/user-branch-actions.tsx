'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { assignBranchUser } from '@/modules/administration/branches/branch-actions';
import { BRANCH_ASSIGNMENT_TYPES } from '@/modules/administration/branches/branch-contract';
import type { SelectOption } from '../user-rules';

interface AssignUserBranchButtonProps {
  userId: string;
  userName: string;
  /** The ACTIVE branches on offer (assigning to an inactive one is a 409). */
  branches: readonly SelectOption[];
  /** The page read one bounded page of branches and more exist: say so under the select. */
  truncated?: boolean;
  /** I2: the organisation the page rendered for; forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

/** Assigns the user whose record this is to a branch: the user is fixed, the branch is chosen.
 * 08's `AssignBranchUserButton` is the mirror image (a fixed branch, a chosen user). */
export function AssignUserBranchButton({
  userId,
  userName,
  branches,
  truncated = false,
  contextOrganisationId,
}: AssignUserBranchButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Assign branch
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign to a branch"
        description={`Give ${userName} access to a branch. It takes effect immediately.`}
        submitLabel="Assign branch"
        action={assignBranchUser}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Branch assigned');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="userId" value={userId} />
            <TextField
              select
              name="branchId"
              label="Branch"
              required
              defaultValue={branches.length === 1 ? (branches[0]?.id ?? '') : ''}
              error={Boolean(fieldErrors.branchId)}
              helperText={
                fieldErrors.branchId ??
                (truncated ? 'Only the first 100 active branches are listed.' : undefined)
              }
            >
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.label}
                </MenuItem>
              ))}
            </TextField>
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
