'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import { formatBusinessDate } from '@/lib/format';
import { nextBusinessDateIso } from '@/lib/business-date';
import {
  advanceBusinessDate,
  completeCloseOfBusiness,
  reopenBusinessDate,
  startCloseOfBusiness,
} from '../business-date-actions';
import type { BusinessDateAction } from '../business-date-rules';

/** I3's fallback focus target when a transition leaves no action button behind; the hero heading
 * in app/(authenticated)/admin/business-date/page.tsx carries this id. */
export const BUSINESS_DATE_FOCUS_FALLBACK_ID = 'business-date-hero-heading';

const COPY: Record<
  BusinessDateAction,
  {
    label: string;
    title: string;
    description: string | ((currentDate: string) => string);
    success: string;
    action: FormAction;
  }
> = {
  'cob.start': {
    label: 'Start close of business',
    title: 'Start close of business?',
    description: 'The business date moves to Closing until close of business is completed.',
    success: 'Close of business started',
    action: startCloseOfBusiness,
  },
  'business_date.advance': {
    label: 'Advance date',
    title: 'Advance the business date',
    // I4: the dialog otherwise never states the current date or the jump being made.
    description: (currentDate: string) =>
      `The current business date is ${formatBusinessDate(currentDate, 'long')}. Advancing ` +
      `can't be undone: the date can never move back.`,
    success: 'Business date advanced',
    action: advanceBusinessDate,
  },
  'cob.complete': {
    label: 'Complete close of business',
    title: 'Complete close of business?',
    description: 'The business date moves to Closed.',
    success: 'Close of business completed',
    action: completeCloseOfBusiness,
  },
  'business_date.reopen': {
    label: 'Reopen',
    title: 'Reopen the business date?',
    description: 'The same date returns to Open.',
    success: 'Business date reopened',
    action: reopenBusinessDate,
  },
};

interface BusinessDateActionsProps {
  actions: readonly BusinessDateAction[];
  currentDate: string;
  /** I2: the organisation the page rendered for; forwarded to `ReasonDialog` as a hidden field. */
  contextOrganisationId?: string;
}

export function BusinessDateActions({
  actions,
  currentDate,
  contextOrganisationId,
}: BusinessDateActionsProps) {
  const notify = useToast();
  const [openAction, setOpenAction] = useState<BusinessDateAction | null>(null);
  const minDate = nextBusinessDateIso(currentDate) ?? undefined;
  const buttonRefs = useRef(new Map<BusinessDateAction, HTMLButtonElement | null>());

  // I3: after a successful start/complete/reopen the trigger's whole action set changes (each
  // status maps to a disjoint action set), the trigger button unmounts, and focus falls to
  // <body>. Advance keeps its own trigger (the status stays OPEN), so `actionKey` never changes
  // for it and this never fires. Comparing against the *previous* key — not a flag set from
  // onSuccess — means it only fires on a real transition, never the initial mount or a
  // history-table repage (`availableBusinessDateActions` returns a new array, same content, on
  // every server render).
  const actionKey = actions.join(',');
  const previousActionKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousActionKey.current !== null && document.activeElement === document.body) {
      const firstActionId = actionKey.split(',')[0] as BusinessDateAction | undefined;
      const target = firstActionId ? buttonRefs.current.get(firstActionId) : null;
      if (target) {
        target.focus();
      } else {
        // Covers a user who holds cob.start but not cob.complete: no button remains at all.
        document.getElementById(BUSINESS_DATE_FOCUS_FALLBACK_ID)?.focus();
      }
    }
    previousActionKey.current = actionKey;
  }, [actionKey]);

  return (
    <>
      {actions.map((id, index) => (
        <Button
          key={id}
          variant={index === 0 ? 'contained' : 'outlined'}
          ref={(node) => {
            buttonRefs.current.set(id, node);
          }}
          onClick={() => {
            setOpenAction(id);
          }}
        >
          {COPY[id].label}
        </Button>
      ))}
      {actions.map((id) => {
        const copy = COPY[id];
        const description =
          typeof copy.description === 'function' ? copy.description(currentDate) : copy.description;
        return (
          <ReasonDialog
            key={id}
            open={openAction === id}
            title={copy.title}
            description={description}
            confirmLabel={copy.label}
            reason="optional"
            action={copy.action}
            contextOrganisationId={contextOrganisationId}
            onClose={() => {
              setOpenAction(null);
            }}
            onSuccess={() => {
              setOpenAction(null);
              notify(copy.success, 'success');
            }}
            fields={
              id === 'business_date.advance'
                ? (fieldErrors) => (
                    <TextField
                      name="newBusinessDate"
                      type="date"
                      label="New business date"
                      required
                      error={Boolean(fieldErrors.newBusinessDate)}
                      helperText={
                        fieldErrors.newBusinessDate ??
                        `Must be after ${formatBusinessDate(currentDate, 'short')}.`
                      }
                      slotProps={{ htmlInput: { min: minDate } }}
                    />
                  )
                : undefined
            }
          />
        );
      })}
    </>
  );
}
