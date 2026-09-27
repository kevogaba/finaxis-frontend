import { unstable_rethrow } from 'next/navigation';
import { humanizeEnum, statusTone } from '@/components/data-display/status-chip';
import { formatBusinessDate } from '@/lib/format';
import { getBusinessDate } from '../business-date-service';
import { BusinessDateChip } from './business-date-chip';

/** App-bar business date (spec §8). A failed read renders nothing, so the shell never breaks. */
export async function BusinessDateIndicator() {
  const current = await getBusinessDate().catch((error: unknown) => {
    // A Next.js control-flow error (redirect()/notFound(), a dynamic-rendering bail-out) must
    // keep propagating, never be swallowed as "the read failed" — mirrors load()'s fix.
    unstable_rethrow(error);
    return null;
  });
  if (!current) return null;
  return (
    <BusinessDateChip
      label={`${formatBusinessDate(current.date, 'short')} · Business date · ${humanizeEnum(current.status)}`}
      color={statusTone(current.status)}
    />
  );
}
