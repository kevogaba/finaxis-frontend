'use client';

import {
  Controller,
  type Control,
  type FieldPathByValue,
  type UseFormTrigger,
} from 'react-hook-form';
import MenuItem from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import type { ChoiceOption } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

interface InviteChoiceFieldProps {
  control: Control<InviteValues>;
  trigger: UseFormTrigger<InviteValues>;
  name: FieldPathByValue<InviteValues, string>;
  label: string;
  options: readonly ChoiceOption[];
  required?: boolean;
  /** Shown under the field while it holds no error. */
  hint?: string;
  /** An empty first option, for an optional choice. */
  noneLabel?: string;
  /** An option shown but not choosable, e.g. One branch before any branch is assigned. */
  disabledValue?: string;
  sx?: TextFieldProps['sx'];
}

/**
 * One of the wizard's selects, bound to React Hook Form. A choice is final, so it validates its own
 * field at once: a refusal clears with the fix (16's `OptionField`). Nothing validates on blur, so
 * no error line moves Continue under the pointer (AGENTS.md).
 */
export function InviteChoiceField({
  control,
  trigger,
  name,
  label,
  options,
  required = false,
  hint,
  noneLabel,
  disabledValue,
  sx,
}: InviteChoiceFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          select
          label={label}
          required={required}
          value={field.value}
          onChange={(event) => {
            field.onChange(event.target.value);
            void trigger(name);
          }}
          onBlur={field.onBlur}
          inputRef={field.ref}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? hint}
          // An optional choice left empty shows its empty option's words ("None"), not a blank
          // field; the theme always shrinks the label above, so the two never overlap.
          slotProps={{ select: { displayEmpty: noneLabel !== undefined } }}
          sx={sx}
        >
          {noneLabel !== undefined && <MenuItem value="">{noneLabel}</MenuItem>}
          {options.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
              disabled={option.value === disabledValue}
            >
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
