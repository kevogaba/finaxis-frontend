import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { load, type Loaded } from '@/lib/api/load';
import { formatBusinessDate } from '@/lib/format';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import { getBusinessDate } from '@/modules/administration/business-date/business-date-service';
import {
  BUSINESS_DATE_DESCRIPTION,
  BUSINESS_DATE_HREF,
  BUSINESS_DATE_LINK,
  CARD_TITLES,
} from '../overview-rules';

/** Spec §10.8's Business date card: the date, from its `dd-MM-yyyy` value with no timezone shift,
 * and its status; a failed read shows its reference in place of the date. */
export function BusinessDateCard({ current }: { current: Loaded<CurrentBusinessDate> }) {
  return (
    <SectionCard
      title={CARD_TITLES.businessDate}
      description={BUSINESS_DATE_DESCRIPTION}
      actions={
        <Link
          component={NextLink}
          href={BUSINESS_DATE_HREF}
          variant="body2"
          sx={{ fontWeight: 600 }}
        >
          {BUSINESS_DATE_LINK}
        </Link>
      }
    >
      {current.ok ? (
        <Box
          sx={{ px: 4, py: 3.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}
        >
          <Typography component="p" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
            {formatBusinessDate(current.value.date, 'long')}
          </Typography>
          <StatusChip value={current.value.status} />
        </Box>
      ) : (
        <ErrorState problem={current.problem} />
      )}
    </SectionCard>
  );
}

/** One read, settled by `load()`: a lost session or a stale context redirects, any other failure
 * shows in this card alone. The app bar's chip makes the same read, so it is shared (`cache()`). */
export async function BusinessDateSection() {
  return <BusinessDateCard current={await load(getBusinessDate())} />;
}
