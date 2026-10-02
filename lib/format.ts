import { DAY_MS, businessDateDay } from '@/lib/business-date';

// Fixed abbreviations: current ICU renders en-GB September as "Sept"; the prototype uses "Sep".
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Dense formatting for operational tables (server-rendered only): `07 Sep 2026` / `10:28`. */
export function formatInstant(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.day ?? ''} ${SHORT_MONTHS[Number(parts.month) - 1] ?? ''} ${parts.year ?? ''}`,
    time: `${parts.hour ?? ''}:${parts.minute ?? ''}`,
  };
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** `dd-MM-yyyy` → `Mon, 7 Sep 2026` (short) or `Monday, 7 September 2026` (long); no zone shift. */
export function formatBusinessDate(value: string, style: 'short' | 'long'): string {
  const day = businessDateDay(value);
  if (day === null) return value;
  const date = new Date(day * DAY_MS);
  if (style === 'long') {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
    date,
  );
  return `${weekday}, ${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}
