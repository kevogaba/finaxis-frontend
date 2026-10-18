'use client';

import { useId, useRef } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldError,
  type UseFormTrigger,
} from 'react-hook-form';
import Alert from '@mui/material/Alert';
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

/** `trigger` and `handleSubmit` put a list's error on `root` (RHF 7.90's field-array rule); a server
 * field error (`setError`) puts it on the list itself. */
type ListError = Partial<FieldError> & { root?: FieldError };
const listMessage = (error: ListError | undefined) => error?.message ?? error?.root?.message;

/** A row's fields side by side from `sm`, stacked below it; Remove stays last. Below `sm` a row that
 * has another row under it is ruled off and given room, so its Remove reads as its own row's and not
 * the next row's (the fields and the rows would otherwise share one gap). */
const row = (columns: string, separated: boolean) =>
  ({
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: `${columns} auto` },
    gap: 3,
    alignItems: 'start',
    ...(separated
      ? // The colour sits in the xs rule: a base `borderColor` comes before the media query's
        // `border-bottom` shorthand, which resets it to currentColor.
        { pb: { xs: 3, sm: 0 }, borderBottom: { xs: 1, sm: 0 }, borderColor: { xs: 'divider' } }
      : {}),
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
  // Each list refusal is described by the Add button that fixes it, so a screen reader hears it there.
  const branchErrorId = useId();
  const roleErrorId = useId();

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
            sx={row('minmax(0, 2fr) minmax(0, 1fr)', index < branchRows.fields.length - 1)}
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
        {branchMessage && (
          <FormHelperText id={branchErrorId} error>
            {branchMessage}
          </FormHelperText>
        )}
        {branchesCapped && (
          <Alert severity="info" role="note">
            {BRANCHES_CAPPED}
          </Alert>
        )}
        <Box>
          <Button
            ref={addBranch}
            variant="outlined"
            startIcon={<AddOutlined />}
            aria-describedby={branchMessage ? branchErrorId : undefined}
            onClick={() => {
              branchRows.append({ ...EMPTY_BRANCH_ROW }, { shouldFocus: true });
              // A list refused for having no row: the new row's own refusal replaces it (rule 8).
              if (branchMessage) void trigger('branchAssignments');
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
              sx={row(
                'minmax(0, 2fr) minmax(12.5rem, 1fr) minmax(0, 2fr)',
                index < roleRows.fields.length - 1,
              )}
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
        {roleMessage && (
          <FormHelperText id={roleErrorId} error>
            {roleMessage}
          </FormHelperText>
        )}
        {rolesCapped && (
          <Alert severity="info" role="note">
            {ROLES_CAPPED}
          </Alert>
        )}
        <Box>
          <Button
            ref={addRole}
            variant="outlined"
            startIcon={<AddOutlined />}
            aria-describedby={roleMessage ? roleErrorId : undefined}
            onClick={() => {
              roleRows.append({ ...EMPTY_ROLE_ROW }, { shouldFocus: true });
              // A list refused for having no row: the new row's own refusal replaces it (rule 8).
              if (roleMessage) void trigger('roleAssignments');
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
