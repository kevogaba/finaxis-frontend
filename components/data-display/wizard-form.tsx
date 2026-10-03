'use client';

import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';
import Paper from '@mui/material/Paper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

export interface WizardStep {
  label: string;
  /** One line under the step's label (from `sm`) and under its heading. */
  helper: string;
}

interface WizardFormProps {
  /** Names the form landmark, e.g. `Create tenant draft`. */
  label: string;
  steps: readonly WizardStep[];
  active: number;
  /** Continue on every step but the last, the submit on the last: the caller validates and moves
   * `active`. */
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onBack: () => void;
  cancelHref: string;
  submitLabel: string;
  pending: boolean;
  /** Error summaries, between the step heading and its fields. */
  alerts?: ReactNode;
  children: ReactNode;
}

/** The sticky action bar is 70 px tall; the rest is a gap. */
const ACTION_BAR_CLEARANCE = 96;

/**
 * A multi-step form (spec §9): the themed Stepper, the current step in a surface, and a sticky
 * action bar. It holds no form state: one React Hook Form spans the steps in the caller.
 */
export function WizardForm({
  label,
  steps,
  active,
  onSubmit,
  onBack,
  cancelHref,
  submitLabel,
  pending,
  alerts,
  children,
}: WizardFormProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(active);

  // A step change starts keyboard and screen-reader users at the new step's top; the first render
  // leaves focus where the page put it.
  useEffect(() => {
    if (shownStep.current === active) return;
    shownStep.current = active;
    headingRef.current?.focus();
  }, [active]);

  const current = steps[active];
  const last = active === steps.length - 1;

  return (
    <Box
      component="form"
      noValidate
      aria-label={label}
      onSubmit={onSubmit}
      sx={{ display: 'grid', gap: 4.5 }}
    >
      {/* The sticky action bar (70 px) must not cover a control the keyboard reaches: the page keeps
          96 px of scroll padding below while a wizard is mounted (WCAG 2.4.11). */}
      <GlobalStyles styles={{ html: { scrollPaddingBottom: ACTION_BAR_CLEARANCE } }} />
      <Stepper activeStep={active}>
        {steps.map((step, index) => (
          <Step key={step.label} aria-current={index === active ? 'step' : undefined}>
            <StepLabel
              optional={
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
                >
                  {step.helper}
                </Typography>
              }
            >
              {step.label}
              {/* The completed check is an unlabelled icon. */}
              {index < active && <span className="sr-only"> (completed)</span>}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
      <Paper sx={{ overflow: 'visible' }}>
        <Box sx={{ px: 6, pt: 5, pb: 4, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="overline" component="p" sx={{ color: 'text.secondary' }}>
            {`Step ${active + 1} of ${steps.length}`}
          </Typography>
          {/* A focus target only (tabIndex -1); the theme's MuiTypography :focus-visible ring shows it,
              as on 08's record title. */}
          <Typography ref={headingRef} tabIndex={-1} component="h2" variant="h4" sx={{ my: 1 }}>
            {current?.label}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {current?.helper}
          </Typography>
        </Box>
        {alerts && <Box sx={{ px: 6, pt: 4.5, display: 'grid', gap: 3 }}>{alerts}</Box>}
        <Box sx={{ p: 6, display: 'grid', gap: 4.5 }}>{children}</Box>
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 5,
            minHeight: 70,
            px: 5,
            py: 3,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2.25,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Button component={NextLink} href={cancelHref} variant="outlined" disabled={pending}>
            Cancel
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={onBack} disabled={active === 0 || pending}>
            Back
          </Button>
          <Button type="submit" variant="contained" loading={pending}>
            {last ? submitLabel : 'Continue'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
