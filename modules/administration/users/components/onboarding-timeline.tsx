import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { StatusChip } from '@/components/data-display/status-chip';
import type { OnboardingProgress } from '../user-rules';

interface OnboardingTimelineProps {
  progress: OnboardingProgress;
}

/** Spec §10.5: the onboarding steps in order, each with a worded chip (never colour alone). Once
 * onboarding has stopped there are no steps, only the sentence that says why. */
export function OnboardingTimeline({ progress }: OnboardingTimelineProps) {
  return (
    <>
      {progress.kind === 'steps' && (
        // `role="list"` is explicit: `listStyle: 'none'` drops list semantics in WebKit.
        <Box
          component="ol"
          role="list"
          aria-label="Onboarding steps"
          sx={{ m: 0, p: 0, listStyle: 'none' }}
        >
          {progress.steps.map((step, index) => (
            <Box
              component="li"
              key={step.label}
              sx={{
                px: 4.5,
                py: 3.5,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              {/* A basis of 0, not a width: the text takes what the chip leaves, so the chip never
                  wraps to a line of its own and the status column stays at the right. */}
              <Box sx={{ minWidth: 0, flex: '1 1 0' }}>
                <Typography sx={{ fontWeight: 700 }}>{`${index + 1}. ${step.label}`}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {step.detail}
                </Typography>
              </Box>
              <StatusChip
                value={step.state.label}
                label={step.state.label}
                tone={step.state.tone}
              />
            </Box>
          ))}
        </Box>
      )}
      {progress.note && (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 4.5, py: 3.5 }}>
          {progress.note}
        </Typography>
      )}
    </>
  );
}
