import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { StatusChip } from '@/components/data-display/status-chip';
import { CHECK_STATES, type ControlCheck } from '../approval-checks';

/** The control checks (spec §10.6): each one's state in a word, then why. Server-Component safe. */
export function ControlChecks({ checks }: { checks: readonly ControlCheck[] }) {
  return (
    <DescriptionList
      columns={1}
      items={checks.map((check) => ({
        label: check.label,
        value: (
          <Box sx={{ display: 'grid', justifyItems: 'start', gap: 1 }}>
            <StatusChip
              value={check.state}
              label={CHECK_STATES[check.state].label}
              tone={CHECK_STATES[check.state].tone}
            />
            <Typography
              component="span"
              variant="body2"
              sx={{ color: 'text.secondary', fontWeight: 400 }}
            >
              {check.detail}
            </Typography>
          </Box>
        ),
      }))}
    />
  );
}
