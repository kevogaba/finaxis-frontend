import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import type { ProvisioningStep } from '../tenant-rules';

export const FAILURE_CODE_NOTE =
  'The platform stopped setting up this institution and reported this code. Keep it for support.';

interface ProvisioningTimelineProps {
  steps: readonly ProvisioningStep[];
  failureCode: string | null;
}

/** Spec §11.2: the onboarding steps in order, each with a worded chip (never colour alone). */
export function ProvisioningTimeline({ steps, failureCode }: ProvisioningTimelineProps) {
  return (
    <>
      <Box component="ol" aria-label="Provisioning steps" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {steps.map((step, index) => (
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
            <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
              <Typography sx={{ fontWeight: 700 }}>{`${index + 1}. ${step.label}`}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {step.detail}
              </Typography>
            </Box>
            <StatusChip value={step.state.label} label={step.state.label} tone={step.state.tone} />
          </Box>
        ))}
      </Box>
      {failureCode && (
        <DescriptionList
          columns={1}
          items={[
            {
              label: 'Failure code',
              value: (
                <>
                  <Box component="code" sx={{ fontFamily: 'monospace' }}>
                    {failureCode}
                  </Box>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}
                  >
                    {FAILURE_CODE_NOTE}
                  </Typography>
                </>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
