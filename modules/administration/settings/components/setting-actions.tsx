'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { timeZones } from '@/modules/administration/branches/branch-rules';
import { resetSetting, updateSetting } from '../settings-actions';
import { switchChange, type EditableKey } from '../settings-rules';

const RESET_DESCRIPTION = "The stored value is removed, so the platform's default applies again.";

interface TimeZoneFieldProps {
  current: string | null;
  error?: string;
}

/** A searchable choice of the zones the platform accepts, posted as `value` (ReasonDialog's form
 * reads its fields uncontrolled, so the choice travels in a hidden input). */
function TimeZoneField({ current, error }: TimeZoneFieldProps) {
  const [zones] = useState(() => timeZones(current ?? undefined));
  const [zone, setZone] = useState(current);
  return (
    <>
      <input type="hidden" name="value" value={zone ?? ''} />
      <Autocomplete
        options={zones}
        value={zone}
        onChange={(_event, next) => {
          setZone(next);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Time zone"
            required
            error={Boolean(error)}
            helperText={error}
          />
        )}
      />
    </>
  );
}

interface SettingActionsProps {
  settingKey: EditableKey;
  /** The platform's label, e.g. "Default time zone". */
  label: string;
  value: string | null;
  reset: boolean;
  /**
   * I2: the organisation the page rendered for, carried to both dialogs as a hidden input so a
   * Server Action can refuse a stale submit after the user switched organisation in another tab.
   */
  contextOrganisationId?: string;
}

/** Edit (the time zone; a switch edits itself) and Reset to default, with their dialogs. */
export function SettingActions({
  settingKey,
  label,
  value,
  reset,
  contextOrganisationId,
}: SettingActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<'edit' | 'reset' | null>(null);
  const close = () => {
    setOpen(null);
  };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editRef = useRef<HTMLButtonElement | null>(null);
  const previousReset = useRef<boolean | null>(null);
  const editsValue = settingKey === 'default_timezone';

  // I3 (07's pattern, business-date-actions.tsx): a successful Reset flips `reset` to false, which
  // unmounts the Reset button and its dialog, so focus would fall to <body>. Comparing against the
  // *previous* reset means this only fires on a real true->false transition.
  useEffect(() => {
    const wasReset = previousReset.current;
    previousReset.current = reset;
    if (wasReset === true && !reset && document.activeElement === document.body) {
      // No Edit on a switch's row: land on the row (SettingRow's role="group", tabIndex={-1}).
      (editRef.current ?? rootRef.current?.closest<HTMLElement>('[role="group"]'))?.focus();
    }
  }, [reset]);

  const name = label.toLowerCase();
  const keyField = <input type="hidden" name="key" value={settingKey} />;

  return (
    <Box ref={rootRef} sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {editsValue && (
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
      {editsValue && (
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
              <TimeZoneField current={value} error={fieldErrors.value} />
            </>
          )}
        />
      )}
      {reset && (
        <ReasonDialog
          open={open === 'reset'}
          title={`Reset ${name}?`}
          description={RESET_DESCRIPTION}
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
    </Box>
  );
}

interface SettingSwitchProps {
  settingKey: string;
  /** The platform's label: the switch's accessible name. */
  label: string;
  checked: boolean;
  /** The holder may change it (settings.update tenant-wide). */
  edit: boolean;
  /** Why it can't be turned on here, shown under it. */
  blocked: string | null;
  contextOrganisationId?: string;
}

/** A BOOLEAN setting. Flipping it asks first; the switch moves only once the platform stored it. */
export function SettingSwitch({
  settingKey,
  label,
  checked,
  edit,
  blocked,
  contextOrganisationId,
}: SettingSwitchProps) {
  const notify = useToast();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  // Fixed when the dialog opens: a success refreshes `checked`, and the closing dialog must not
  // flip to the opposite question while it fades out.
  const [target, setTarget] = useState(!checked);
  const change = switchChange(settingKey, target);
  const close = () => {
    setOpen(false);
  };

  return (
    <Box sx={{ display: 'grid', justifyItems: 'start', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Switch
          checked={checked}
          disabled={!edit || blocked !== null}
          onChange={() => {
            setTarget(!checked);
            setOpen(true);
          }}
          slotProps={{
            input: { 'aria-label': label, 'aria-describedby': blocked ? reasonId : undefined },
          }}
        />
        <Typography>{checked ? 'On' : 'Off'}</Typography>
      </Box>
      {blocked && (
        <Typography id={reasonId} variant="caption" sx={{ color: 'text.secondary' }}>
          {blocked}
        </Typography>
      )}
      {edit && change && (
        <ReasonDialog
          open={open}
          title={change.title}
          description={change.description}
          confirmLabel={change.confirmLabel}
          reason={change.reason}
          action={updateSetting}
          contextOrganisationId={contextOrganisationId}
          onClose={close}
          onSuccess={() => {
            close();
            notify(change.done, 'success');
          }}
          fields={() => (
            <>
              <input type="hidden" name="key" value={settingKey} />
              <input type="hidden" name="value" value={String(target)} />
            </>
          )}
        />
      )}
    </Box>
  );
}
