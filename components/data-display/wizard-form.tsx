'use client';

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
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

/** The sticky action bar is 70 px tall in one row, and 114 px when its buttons wrap to two rows on a
 * narrow viewport (at 360 px "Send invitation" drops below Cancel and Back). 114 px plus a 26 px gap
 * is the least the page keeps; a taller bar (larger text, zoom, a longer label) gets its own height
 * plus the gap, measured. */
const ACTION_BAR_CLEARANCE = 140;
const ACTION_BAR_GAP = 26;

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
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);

  // The bar's height decides the scroll clearance below: measured, so a bar that grows past its
  // two-row 114 px still never covers the control the keyboard reaches (WCAG 2.4.11).
  useEffect(() => {
    const bar = barRef.current;
    // jsdom (unit tests) has no ResizeObserver; every real browser does, and the 140 px floor holds.
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setBarHeight(bar.getBoundingClientRect().height);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, []);
  const clearance = Math.max(ACTION_BAR_CLEARANCE, Math.ceil(barHeight) + ACTION_BAR_GAP);

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
      {/* The sticky action bar (70 px, or 114 px when its buttons wrap) must not cover a control the
          keyboard reaches: the page keeps at least 140 px of scroll padding below while a wizard is
          mounted, and the bar's measured height plus 26 px when that is more (WCAG 2.4.11). */}
      <GlobalStyles styles={{ html: { scrollPaddingBottom: clearance } }} />
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
          ref={barRef}
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
