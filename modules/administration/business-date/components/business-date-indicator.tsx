import Chip from '@mui/material/Chip';
import EventOutlined from '@mui/icons-material/EventOutlined';
import { unstable_rethrow } from 'next/navigation';
import NextLink from '@/components/navigation/next-link';
import { humanizeEnum, statusTone } from '@/components/data-display/status-chip';
import { formatBusinessDate } from '@/lib/format';
import { getBusinessDate } from '../business-date-service';

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
    <Chip
      component={NextLink}
      href="/admin/business-date"
      clickable
      size="small"
      variant="soft"
      color={statusTone(current.status)}
      icon={<EventOutlined />}
      label={`${formatBusinessDate(current.date, 'short')} · Business date · ${humanizeEnum(current.status)}`}
      // Ellipsizes the label before the header itself overflows (the app-bar slot hides below
      // `lg`). ponytail: the prototype's icon-only band (≤ 1180 px) is deferred to the visual pass.
      sx={{ maxWidth: '100%' }}
    />
  );
}
