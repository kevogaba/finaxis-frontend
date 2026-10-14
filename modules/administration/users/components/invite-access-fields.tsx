'use client';

import { useRef } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldError,
  type UseFormTrigger,
} from 'react-hook-form';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import {
  ASSIGNMENT_TYPE_OPTIONS,
  BRANCHES_CAPPED,
  needsBranch,
  ROLES_CAPPED,
  SCOPE_OPTIONS,
  toChoices,
} from '../invite-rules';
import { EMPTY_BRANCH_ROW, EMPTY_ROLE_ROW, type InviteValues } from '../invite-schema';
import type { SelectOption } from '../user-rules';
import { InviteChoiceField } from './invite-choice-field';

const TENANT_HELP = 'Applies at every branch and at institution level.';
const TENANT_HELP_NO_BRANCH = `${TENANT_HELP} Add a branch above to scope a role to one branch.`;
const BRANCH_HELP = 'Applies only while that branch is selected.';

/** An error on a whole list sits at its root: `trigger` puts it on the list, `handleSubmit` on
 * `root` (RHF's field-array rule), and a server field error on the list again. */
type ListError = Partial<FieldError> & { root?: FieldError };
const listMessage = (error: ListError | undefined) => error?.message ?? error?.root?.message;

/** A row's fields side by side from `sm`, stacked below it; Remove stays last. */
const row = (columns: string) =>
  ({
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: `${columns} auto` },
    gap: 3,
    alignItems: 'start',
  }) as const;
/** Remove lines up with the fields, under their labels. */
const REMOVE = { justifySelf: 'start', mt: { sm: 5.5 } } as const;

interface InviteAccessFieldsProps {
  control: Control<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  rolesCapped: boolean;
  branchesCapped: boolean;
  /** The two lists' own errors (a missing branch or role), from the form state. */
  branchListError?: ListError;
  roleListError?: ListError;
}

/**
 * The Access step (spec §10.5; Ruling 2): branch assignments first, because a branch-scoped role
 * must name one of them; then the roles; then the primary branch. Only ACTIVE roles and branches are
 * offered, so the backend's ACTIVE rules (BG-07) hold for every choice.
 */
export function InviteAccessFields({
  control,
  trigger,
  roles,
  branches,
  rolesCapped,
  branchesCapped,
  branchListError,
  roleListError,
}: InviteAccessFieldsProps) {
  const branchRows = useFieldArray({ control, name: 'branchAssignments' });
  const roleRows = useFieldArray({ control, name: 'roleAssignments' });
  const addBranch = useRef<HTMLButtonElement>(null);
  const addRole = useRef<HTMLButtonElement>(null);
  const membershipType = useWatch({ control, name: 'membershipType' });
  const assignedRows = useWatch({ control, name: 'branchAssignments' });
  const roleValues = useWatch({ control, name: 'roleAssignments' });
  const assigned = new Set(assignedRows.map((assignment) => assignment.branchId).filter(Boolean));
  const branchChoices = toChoices(branches);
  const roleChoices = toChoices(roles);
  const branchMessage = listMessage(branchListError);
  const roleMessage = listMessage(roleListError);

  return (
    <>
      <Box component="section" aria-labelledby="invite-branches" sx={{ display: 'grid', gap: 3 }}>
        <Typography id="invite-branches" component="h3" variant="h5">
          Branch assignments
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {needsBranch(membershipType)
            ? 'Staff and admin members need at least one branch. Assignment types are labels; roles grant permissions.'
            : 'Optional for auditors and system members. Assignment types are labels; roles grant permissions.'}
        </Typography>
        {branchRows.fields.map((field, index) => (
          <Box
            key={field.id}
            role="group"
            aria-label={`Branch assignment ${index + 1}`}
            sx={row('minmax(0, 2fr) minmax(0, 1fr)')}
          >
            <InviteChoiceField
              control={control}
              trigger={trigger}
              name={`branchAssignments.${index}.branchId`}
              label="Branch"
              options={branchChoices}
              required
            />
            <InviteChoiceField
              control={control}
              trigger={trigger}
              name={`branchAssignments.${index}.assignmentType`}
              label="Assignment type"
              options={ASSIGNMENT_TYPE_OPTIONS}
              required
            />
            <Button
              aria-label={`Remove branch assignment ${index + 1}`}
              onClick={() => {
                branchRows.remove(index);
                addBranch.current?.focus();
              }}
              sx={REMOVE}
            >
              Remove
            </Button>
          </Box>
        ))}
        {branchMessage && <FormHelperText error>{branchMessage}</FormHelperText>}
        {branchesCapped && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {BRANCHES_CAPPED}
          </Typography>
        )}
        <Box>
          <Button
            ref={addBranch}
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={() => {
              branchRows.append({ ...EMPTY_BRANCH_ROW }, { shouldFocus: true });
            }}
          >
            Add branch
          </Button>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="invite-roles" sx={{ display: 'grid', gap: 3 }}>
        <Typography id="invite-roles" component="h3" variant="h5">
          Roles
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          At least one role. A branch-scoped role needs one of their branches above.
        </Typography>
        {roleRows.fields.map((field, index) => {
          const scope = roleValues[index]?.scopeType ?? 'TENANT';
          const chosen = roleValues[index]?.branchId ?? '';
          // Their branches above, plus a branch chosen before it was taken away there, so the
          // select still shows it, with the refusal under it.
          const scopeBranches = branchChoices.filter(
            (branch) => assigned.has(branch.value) || branch.value === chosen,
          );
          return (
            <Box
              key={field.id}
              role="group"
              aria-label={`Role ${index + 1}`}
              sx={row('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr)')}
            >
              <InviteChoiceField
                control={control}
                trigger={trigger}
                name={`roleAssignments.${index}.roleId`}
                label="Role"
                options={roleChoices}
                required
              />
              <InviteChoiceField
                control={control}
                trigger={trigger}
                name={`roleAssignments.${index}.scopeType`}
                label="Scope"
                options={SCOPE_OPTIONS}
                required
                disabledValue={assigned.size === 0 ? 'BRANCH' : undefined}
                hint={
                  scope === 'BRANCH'
                    ? BRANCH_HELP
                    : assigned.size === 0
                      ? TENANT_HELP_NO_BRANCH
                      : TENANT_HELP
                }
              />
              {scope === 'BRANCH' ? (
                <InviteChoiceField
                  control={control}
                  trigger={trigger}
                  name={`roleAssignments.${index}.branchId`}
                  label="Branch"
                  options={scopeBranches}
                  required
                />
              ) : (
                // Keeps Remove in its column while the role applies everywhere.
                <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' } }} />
              )}
              <Button
                aria-label={`Remove role ${index + 1}`}
                onClick={() => {
                  roleRows.remove(index);
                  addRole.current?.focus();
                }}
                sx={REMOVE}
              >
                Remove
              </Button>
            </Box>
          );
        })}
        {roleMessage && <FormHelperText error>{roleMessage}</FormHelperText>}
        {rolesCapped && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ROLES_CAPPED}
          </Typography>
        )}
        <Box>
          <Button
            ref={addRole}
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={() => {
              roleRows.append({ ...EMPTY_ROLE_ROW }, { shouldFocus: true });
            }}
          >
            Add role
          </Button>
        </Box>
      </Box>

      <InviteChoiceField
        control={control}
        trigger={trigger}
        name="primaryBranchId"
        label="Primary branch"
        options={branchChoices}
        noneLabel="None"
        hint="Optional. Shown on their record as their main branch."
        sx={{ maxWidth: 640 }}
      />
    </>
  );
}
