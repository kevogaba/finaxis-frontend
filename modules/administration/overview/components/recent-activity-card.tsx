import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import NextLink from '@/components/navigation/next-link';
import { load, type Loaded } from '@/lib/api/load';
import { getOrganisationTimeZone, resolveUserNames } from '@/lib/api/lookups';
import {
  ACTIVITY_HREF,
  ACTIVITY_LABEL,
  ACTIVITY_LINK,
  activityDescription,
  activityRows,
  CARD_TITLES,
  NO_ACTIVITY,
  type ActivityRow,
} from '../overview-rules';
import { listRecentActivity } from '../overview-service';

/** Spec §10.8's Recent activity, a compact list rather than the 900 px audit table (Ruling 6):
 * each event's action opens it in the audit trail's drawer. */
export function RecentActivityCard({
  timeZone,
  activity,
}: {
  timeZone: string;
  activity: Loaded<readonly ActivityRow[]>;
}) {
  return (
    <SectionCard
      title={CARD_TITLES.activity}
      description={activityDescription(timeZone)}
      actions={
        <Link component={NextLink} href={ACTIVITY_HREF} variant="body2" sx={{ fontWeight: 600 }}>
          {ACTIVITY_LINK}
        </Link>
      }
    >
      {!activity.ok ? (
        <ErrorState problem={activity.problem} />
      ) : activity.value.length === 0 ? (
        <Typography sx={{ px: 4, py: 3.5, color: 'text.secondary' }}>{NO_ACTIVITY}</Typography>
      ) : (
        <Box
          component="ul"
          role="list"
          aria-label={ACTIVITY_LABEL}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {activity.value.map((row, index) => (
            <Box
              component="li"
              key={row.id}
              sx={{ px: 4, py: 2.5, borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}
            >
              <Link
                component={NextLink}
                href={row.href}
                aria-label={row.linkLabel}
                variant="body2"
                sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
              >
                {row.action}
              </Link>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
              >
                {`${row.actor} · ${row.when}`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

/** One audit read, settled by `load()`. Each lookup only with its code (rule 5, spec §9): actors are
 * named one read per distinct actor on these rows with `user.view` (BG-09, BG-16), else a short id;
 * times use the organisation's timezone with `tenant.view`, else UTC. */
export async function RecentActivitySection({
  names: readNames,
  timeZone: readTimeZone,
}: {
  names: boolean;
  timeZone: boolean;
}) {
  const [events, timeZone] = await Promise.all([
    load(listRecentActivity()),
    readTimeZone ? getOrganisationTimeZone() : 'UTC',
  ]);
  if (!events.ok) return <RecentActivityCard timeZone={timeZone} activity={events} />;
  const names = readNames
    ? await resolveUserNames(
        events.value.items.flatMap((event) => (event.actorUserId ? [event.actorUserId] : [])),
      )
    : NO_NAMES;
  return (
    <RecentActivityCard
      timeZone={timeZone}
      activity={{ ok: true, value: activityRows(events.value.items, names, timeZone) }}
    />
  );
}
