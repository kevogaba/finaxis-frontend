'use client';

import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import type { Theme } from '@mui/material/styles';
import { INVITATION_NOTE } from '../invite-rules';
import type { InviteValues } from '../invite-schema';

/** Field groups stay a readable width on a wide screen, as 16's wizard does. */
const FIELD_GROUP = { maxWidth: 640, display: 'grid', gap: 4.5 } as const;

/** Where a flag's label text starts, so its description starts there too: MUI's medium checkbox is
 * its 24 px icon (scaled with the theme's type by `pxToRem`) in 9 px of padding on each side,
 * pulled 11 px left by FormControlLabel. */
const LABEL_INDENT = (theme: Theme) => `calc(${theme.typography.pxToRem(24)} + 7px)`;

interface FlagProps {
  control: Control<InviteValues>;
  name: 'sendIdentityInvite' | 'sendApplicationInvite';
  label: string;
  description: string;
}

/** A flag the form keeps as `'true'`/`'false'` (FormData), described by its own line. */
function Flag({ control, name, label, description }: FlagProps) {
  const descriptionId = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Box>
          <FormControlLabel
            label={label}
            control={
              <Checkbox
                checked={field.value === 'true'}
                onChange={(_event, checked) => {
                  field.onChange(checked ? 'true' : 'false');
                }}
                onBlur={field.onBlur}
                slotProps={{ input: { 'aria-describedby': descriptionId } }}
              />
            }
          />
          <FormHelperText id={descriptionId} sx={{ mt: 0, ml: LABEL_INDENT }}>
            {description}
          </FormHelperText>
        </Box>
      )}
    />
  );
}

/** The Invitation step (spec §10.5; Ruling 5): the two contract flags (contract §D), hedged. */
export function InviteInvitationFields({ control }: { control: Control<InviteValues> }) {
  return (
    <Box sx={FIELD_GROUP}>
      <Flag
        control={control}
        name="sendIdentityInvite"
        label="Send the identity-provider invitation"
        description="After approval, once their sign-in identity is created, the identity provider emails them to verify their address."
      />
      <Flag
        control={control}
        name="sendApplicationInvite"
        label="Send the application invitation"
        description="Also sends them the application's own invitation email."
      />
      <Alert severity="info" role="note">
        {INVITATION_NOTE}
      </Alert>
    </Box>
  );
}
