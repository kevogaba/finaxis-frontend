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
