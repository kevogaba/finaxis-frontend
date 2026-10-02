'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { resetSetting, updateSetting } from '../settings-actions';
import { settingOptions, type AllowedSettingActions } from '../settings-rules';

const RESET_DESCRIPTION = 'The stored value is removed, so this setting goes back to not set.';
// While editing is blocked (BG-04), Reset is one-way in the product, so the dialog says so.
const RESET_IS_ONE_WAY =
  "Editing isn't available yet, so you won't be able to set a new value here afterwards.";

interface SettingActionsProps extends AllowedSettingActions {
  label: string;
  /** Why Edit is disabled (BG-04), or null when editing ships. */
  editBlocked: string | null;
  /**
   * I2: the organisation the page rendered for, carried to both dialogs as a hidden input so a
   * Server Action can refuse a stale submit after the user switched organisation in another tab.
   */
  contextOrganisationId?: string;
}

export function SettingActions({
  settingKey,
  value,
  reset,
  label,
  editBlocked,
  contextOrganisationId,
}: SettingActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<'edit' | 'reset' | null>(null);
  const close = () => {
    setOpen(null);
  };
  const editRef = useRef<HTMLButtonElement | null>(null);
  const previousReset = useRef<boolean | null>(null);

  // I3 (07's pattern, business-date-actions.tsx:83-104): a successful Reset flips `reset` to
  // false, which unmounts the Reset button and its dialog, so focus would fall to <body>.
  // Comparing against the *previous* reset (not a flag set from onSuccess) means this only fires
  // on a real true->false transition, never the initial mount or an unrelated re-render.
  useEffect(() => {
    const wasReset = previousReset.current;
    previousReset.current = reset;
    if (wasReset === true && !reset && document.activeElement === document.body) {
      if (editBlocked === null) {
        editRef.current?.focus();
      } else {
        // Edit stays disabled, so it can't take focus itself: land on the row instead
        // (SettingRow's role="group" Box carries tabIndex={-1} for exactly this).
        editRef.current?.closest<HTMLElement>('[role="group"]')?.focus();
      }
    }
  }, [reset, editBlocked]);

  const name = label.toLowerCase();
  const keyField = <input type="hidden" name="key" value={settingKey} />;

  return (
    <>
      {editBlocked ? (
        // A disabled button takes no pointer events, so the span carries the tooltip. describeChild
        // makes the reason the span's title/description; the default aria-label is prohibited on a
        // generic span (axe). The catalogue repeats the reason visibly for keyboard users.
        <Tooltip title={editBlocked} describeChild>
          <span>
            <Button variant="outlined" size="small" disabled ref={editRef}>
              Edit
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          size="small"
          ref={editRef}
          onClick={() => {
            setOpen('edit');
          }}
        >
          Edit
        </Button>
      )}
      {reset && (
        <Button
          size="small"
          onClick={() => {
            setOpen('reset');
          }}
        >
          Reset to default
        </Button>
      )}
      {!editBlocked && (
        <ReasonDialog
          open={open === 'edit'}
          title={`Edit ${name}`}
          description="The new value is stored for this institution."
          confirmLabel="Save"
          reason="optional"
          action={updateSetting}
          contextOrganisationId={contextOrganisationId}
          onClose={close}
          onSuccess={() => {
            close();
            notify(`${label} updated`, 'success');
          }}
          fields={(fieldErrors) => (
            <>
              {keyField}
              <TextField
                select
                name="value"
                label={settingKey === 'default_timezone' ? 'Timezone' : 'Currency'}
                defaultValue={value ?? ''}
                required
                error={Boolean(fieldErrors.value)}
                helperText={fieldErrors.value}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {settingOptions(settingKey, value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </TextField>
            </>
          )}
        />
      )}
      {reset && (
        <ReasonDialog
          open={open === 'reset'}
          title={`Reset ${name}?`}
          description={editBlocked ? `${RESET_DESCRIPTION} ${RESET_IS_ONE_WAY}` : RESET_DESCRIPTION}
          confirmLabel="Reset to default"
          reason="optional"
          action={resetSetting}
          contextOrganisationId={contextOrganisationId}
          onClose={close}
          onSuccess={() => {
            close();
            notify(`${label} reset to default`, 'success');
          }}
          fields={() => keyField}
        />
      )}
    </>
  );
}
