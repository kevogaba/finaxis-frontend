'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import { nextBusinessDateIso } from '@/lib/business-date';
import {
  advanceBusinessDate,
  completeCloseOfBusiness,
  reopenBusinessDate,
  startCloseOfBusiness,
} from '../business-date-actions';
import type { BusinessDateAction } from '../business-date-rules';

const COPY: Record<
  BusinessDateAction,
  { label: string; title: string; description: string; success: string; action: FormAction }
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
    description: 'Choose a later date. Skipping days is allowed; going back is not.',
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
}

export function BusinessDateActions({ actions, currentDate }: BusinessDateActionsProps) {
  const notify = useToast();
  const [openAction, setOpenAction] = useState<BusinessDateAction | null>(null);
  const minDate = nextBusinessDateIso(currentDate) ?? undefined;

  return (
    <>
      {actions.map((id, index) => (
        <Button
          key={id}
          variant={index === 0 ? 'contained' : 'outlined'}
          onClick={() => {
            setOpenAction(id);
          }}
        >
          {COPY[id].label}
        </Button>
      ))}
      {actions.map((id) => (
        <ReasonDialog
          key={id}
          open={openAction === id}
          title={COPY[id].title}
          description={COPY[id].description}
          confirmLabel={COPY[id].label}
          reason="optional"
          action={COPY[id].action}
          onClose={() => {
            setOpenAction(null);
          }}
          onSuccess={() => {
            setOpenAction(null);
            notify(COPY[id].success, 'success');
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
                      fieldErrors.newBusinessDate ?? 'Must be after the current business date.'
                    }
                    slotProps={{ htmlInput: { min: minDate } }}
                  />
                )
              : undefined
          }
        />
      ))}
    </>
  );
}
