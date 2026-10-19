import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { can } from '@/auth/permissions';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import {
  countBranchActivations,
  countUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { getBusinessDate } from '@/modules/administration/business-date/business-date-service';
import { listSettings } from '@/modules/administration/settings/settings-service';
import { CARD_TITLES } from '../overview-rules';
import { countActiveBranches, countActiveMemberships } from '../overview-service';
import {
  operationalReadiness,
  READINESS_CODES,
  READINESS_DESCRIPTION,
  READINESS_STATES,
  type ReadinessItemId,
  type ReadinessView,
} from '../readiness-rules';

/** Spec §10.8's Operational readiness: one teal bar for the share of items ready (spec §7.3,
 * through the bar's own `color`, never a theme default: `ListNavigationProgress` shares the
 * component), then the five items, each with its state in words and, where the holder can open
 * it, a link to the page where it is dealt with (Ruling 12). */
export function ReadinessCard({ view }: { view: ReadinessView }) {
  return (
    <SectionCard title={CARD_TITLES.readiness} description={READINESS_DESCRIPTION}>
      <Box sx={{ px: 4, pt: 3.5, pb: 3 }}>
        <Typography component="p" variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
          {view.summary}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={view.progress}
          color="success"
          aria-label={CARD_TITLES.readiness}
          aria-valuetext={view.summary}
        />
      </Box>
      <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {view.items.map((entry) => (
          <Box
            component="li"
            key={entry.id}
            sx={{
              px: 4,
              py: 2.5,
              borderTop: 1,
              borderColor: 'divider',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              alignItems: 'start',
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h3" variant="body1" sx={{ fontWeight: 700 }}>
                {entry.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
              >
                {entry.detail}
              </Typography>
              {entry.link ? (
                <Link
                  component={NextLink}
                  href={entry.link.href}
                  variant="body2"
                  sx={{ display: 'inline-block', mt: 0.5, fontWeight: 600 }}
                >
                  {entry.link.label}
                </Link>
              ) : null}
            </Box>
            <StatusChip
              value={entry.state}
              label={READINESS_STATES[entry.state].label}
              tone={READINESS_STATES[entry.state].tone}
            />
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

/** Each item's reads only with its code, all in parallel and each settled by `load()`: a lost
 * session or a stale context redirects, any other failure marks that item alone. The approval
 * counts and the business date are shared with the app bar per request (`cache()`). */
export async function ReadinessSection({
  permissions,
  organisationStatus,
}: {
  permissions: readonly string[];
  organisationStatus: string;
}) {
  const may = (id: ReadinessItemId) => can({ permissions }, READINESS_CODES[id]);
  const [settings, activeBranches, pendingBranches, activeMembers, userApprovals, businessDate] =
    await Promise.all([
      may('institution') ? load(listSettings()) : null,
      may('branches') ? load(countActiveBranches()) : null,
      may('branches') ? load(countBranchActivations()) : null,
      may('people') ? load(countActiveMemberships()) : null,
      may('onboarding') ? load(countUserApprovals()) : null,
      may('businessDate') ? load(getBusinessDate()) : null,
    ]);
  return (
    <ReadinessCard
      view={operationalReadiness(
        {
          organisationStatus,
          settings,
          activeBranches,
          pendingBranches,
          activeMembers,
          userApprovals,
          businessDate,
        },
        { permissions },
      )}
    />
  );
}
