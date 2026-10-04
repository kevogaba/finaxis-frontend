'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { useToast } from '@/components/providers/toast-provider';
import { RoleScopeFields } from '@/modules/administration/roles/components/role-assignment-actions';
import { assignRole } from '@/modules/administration/roles/role-actions';
import type { SelectOption } from '../user-rules';

interface AssignUserRoleButtonProps {
  userId: string;
  userName: string;
  /** The ACTIVE roles on offer (a DISABLED role grants nothing, BG-27). */
  roles: readonly SelectOption[];
  /** Why the roles on offer may be only some of them, when they are (shown under the Role field). */
  roleHint?: string;
  /** The branches a BRANCH-scope role may name: the ones the user is already assigned to. */
  branches: readonly SelectOption[];
  /** Why no branch is offered, when none is (shown under the Scope field). */
  branchHint?: string;
  /** I2: the organisation the page rendered for; forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

/** Assigns a role to the user whose record this is: the user is fixed, the role is chosen. 09's
 * `AssignRoleButton` is the mirror image (a fixed role, a chosen user). */
export function AssignUserRoleButton({
  userId,
  userName,
  roles,
  roleHint,
  branches,
  branchHint,
  contextOrganisationId,
}: AssignUserRoleButtonProps) {
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
        Assign role
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign a role"
        description={`Give ${userName} a role. It takes effect immediately.`}
        submitLabel="Assign role"
        action={assignRole}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Role assigned');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="userId" value={userId} />
            <TextField
              select
              name="roleId"
              label="Role"
              required
              defaultValue={roles.length === 1 ? (roles[0]?.id ?? '') : ''}
              error={Boolean(fieldErrors.roleId)}
              helperText={fieldErrors.roleId ?? roleHint}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.label}
                </MenuItem>
              ))}
            </TextField>
            <RoleScopeFields
              branches={branches}
              branchHint={branchHint}
              fieldErrors={fieldErrors}
            />
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}
