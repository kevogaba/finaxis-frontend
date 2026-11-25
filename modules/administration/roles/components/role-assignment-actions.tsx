'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { useToast } from '@/components/providers/toast-provider';
import { UserPicker } from '@/modules/administration/users/components/user-picker';
import { assignRole, revokeRoleAssignment } from '../role-actions';
import type { RoleScopeType } from '../role-contract';

export interface BranchOption {
  id: string;
  label: string;
}

const TENANT_HELP = 'Applies at every branch and at institution level.';
const BRANCH_HELP =
  'Applies at that branch only, while it is active. The user must already be assigned to it.';
/** Why Institution is disabled: the holder assigns roles at some branches only (BG-03). */
export const INSTITUTION_SCOPE_UNAVAILABLE =
  'You can assign roles at some branches only, so institution scope isn’t available.';

interface RoleScopeFieldsProps {
  /** Branches a BRANCH-scope assignment may name: where the holder may assign at that branch,
   * whichever branch is selected (`canAssignRoleAt`, BG-03). Empty disables branch scope
   * (Ruling 10). */
  branches: readonly BranchOption[];
  fieldErrors: Partial<Record<string, string>>;
  /** Why "One branch" is disabled, shown under the Scope field while `branches` is empty; while it
   * isn't, why the branches offered may be only some (a capped read), shown under the Branch field. */
  branchHint?: string;
  /** Institution scope needs the grant tenant-wide (`canAssignRoleInstitutionWide`): false disables
   * it, says why, and starts at branch scope. */
  institution?: boolean;
}

/**
 * The `scopeType` and `branchId` fields of a role-assignment form. This layer composes them with
 * `UserPicker`; layer 10 composes them with a role picker on the user record. The branch field
 * renders only for BRANCH scope, so TENANT never carries one.
 *
 * Uncontrolled, with fixed field names (`scopeType`, `branchId`): it fits a FormData drawer; a
 * React Hook Form wizard (layer 11) needs added props.
 */
export function RoleScopeFields({
  branches,
  fieldErrors,
  branchHint,
  institution = true,
}: RoleScopeFieldsProps) {
  const [scope, setScope] = useState<RoleScopeType>(institution ? 'TENANT' : 'BRANCH');
  const offered = branches.length > 0;
  const tenantHelp = !offered && branchHint ? `${TENANT_HELP} ${branchHint}` : TENANT_HELP;
  const branchHelp = institution ? BRANCH_HELP : `${BRANCH_HELP} ${INSTITUTION_SCOPE_UNAVAILABLE}`;
  const helperText = fieldErrors.scopeType ?? (scope === 'TENANT' ? tenantHelp : branchHelp);
  return (
    <>
      <TextField
        select
        name="scopeType"
        label="Scope"
        required
        value={scope}
        onChange={(event) => {
          setScope(event.target.value === 'BRANCH' ? 'BRANCH' : 'TENANT');
        }}
        error={Boolean(fieldErrors.scopeType)}
        helperText={helperText}
      >
        <MenuItem value="TENANT" disabled={!institution}>
          Institution (all branches)
        </MenuItem>
        <MenuItem value="BRANCH" disabled={!offered}>
          One branch
        </MenuItem>
      </TextField>
      {scope === 'BRANCH' && (
        <TextField
          select
          name="branchId"
          label="Branch"
          required
          defaultValue={branches.length === 1 ? (branches[0]?.id ?? '') : ''}
          error={Boolean(fieldErrors.branchId)}
          helperText={fieldErrors.branchId ?? (offered ? branchHint : undefined)}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    </>
  );
}

interface AssignRoleButtonProps {
  roleId: string;
  roleName: string;
  branches: readonly BranchOption[];
  /** See `RoleScopeFields`. */
  institution?: boolean;
  /** Left out of the user search: the signed-in user, where they can't add to their own access
   * (#342). */
  excludeUserId?: string;
  /** I2: forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

export function AssignRoleButton({
  roleId,
  roleName,
  branches,
  institution = true,
  excludeUserId,
  contextOrganisationId,
}: AssignRoleButtonProps) {
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
        Assign role
      </Button>
      <AssignmentDrawer
        open={open}
        title="Assign this role"
        description={`Give a user ${roleName}. It takes effect immediately.`}
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
            <input type="hidden" name="roleId" value={roleId} />
            <UserPicker
              name="userId"
              label="User"
              required
              error={fieldErrors.userId}
              excludeUserId={excludeUserId}
            />
            <RoleScopeFields
              branches={branches}
              fieldErrors={fieldErrors}
              institution={institution}
            />
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RevokeRoleAssignmentButtonProps {
  assignmentId: string;
  userLabel: string;
  roleLabel: string;
  /** `institution-wide`, or the branch name of a BRANCH-scope assignment. */
  scopeLabel: string;
  /** The signed-in user's own assignment (Ruling 12). */
  self: boolean;
  /** I2: forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** Revokes one role assignment. 10 reuses it on the user record's Roles & access tab. */
export function RevokeRoleAssignmentButton({
  assignmentId,
  userLabel,
  roleLabel,
  scopeLabel,
  self,
  contextOrganisationId,
}: RevokeRoleAssignmentButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  // I3: a successful revoke removes this row — and this button — so focus falls back to the
  // record title from the unmount cleanup (08's RevokeAssignmentButton pattern).
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        // The dialog title's phrasing plus the scope: a user's rows differ by role and scope.
        aria-label={`Revoke ${userLabel}'s ${roleLabel} assignment (${scopeLabel})`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        tone="error"
        title={`Revoke ${userLabel}'s ${roleLabel} assignment?`}
        description={`${userLabel} loses ${roleLabel} (${scopeLabel}) immediately.${
          self
            ? ' This is your own assignment: you lose these permissions too, and possibly your access to this page.'
            : ''
        }`}
        confirmLabel="Revoke"
        action={revokeRoleAssignment}
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
        <input type="hidden" name="assignmentId" value={assignmentId} />
      </ConfirmDialog>
    </>
  );
}
