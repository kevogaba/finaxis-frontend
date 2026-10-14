'use client';

import type { Control, FieldErrors, UseFormRegister, UseFormTrigger } from 'react-hook-form';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { IDENTITY_LABELS, MEMBERSHIP_TYPE_OPTIONS, type IdentityField } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import { InviteChoiceField } from './invite-choice-field';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;

interface InviteIdentityFieldsProps {
  control: Control<InviteValues>;
  register: UseFormRegister<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  errors: FieldErrors<InviteValues>;
}

/** The Identity step (spec §10.5): who is invited, and as what kind of member. */
export function InviteIdentityFields({
  control,
  register,
  trigger,
  errors,
}: InviteIdentityFieldsProps) {
  // An error clears as soon as its field is fixed, not on the blur that follows: that blur can be
  // the click on Continue, and the summary leaving would shift the page under the pointer (16).
  const text = (name: Exclude<IdentityField, 'membershipType'>, hint?: string) => ({
    ...register(name, {
      onChange: () => {
        if (errors[name] !== undefined) void trigger(name);
      },
    }),
    label: IDENTITY_LABELS[name],
    error: errors[name] !== undefined,
    helperText: errors[name]?.message ?? hint,
  });

  return (
    <Box sx={FIELD_GROUP}>
      <TextField
        required
        autoComplete="off"
        {...text('displayName')}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <TextField
        required
        type="email"
        autoComplete="off"
        {...text('email', "We check it isn't already in use in this institution.")}
      />
      <TextField
        required
        autoComplete="off"
        {...text('username', 'Letters, digits, dots, underscores or hyphens, 3–50 characters.')}
        slotProps={{ htmlInput: { maxLength: 50, spellCheck: false, autoCapitalize: 'none' } }}
      />
      <TextField
        type="tel"
        autoComplete="off"
        {...text(
          'phone',
          "Optional. International format, e.g. +254712000140. It can't be viewed after the invitation is sent.",
        )}
      />
      <InviteChoiceField
        control={control}
        trigger={trigger}
        name="membershipType"
        label={IDENTITY_LABELS.membershipType}
        options={MEMBERSHIP_TYPE_OPTIONS}
        required
        hint="Staff and admin members need a branch; auditors and system members don't."
      />
    </Box>
  );
}
