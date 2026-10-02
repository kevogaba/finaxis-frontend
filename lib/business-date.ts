/**
 * Business dates are `dd-MM-yyyy` calendar dates with no timezone (contract §A). Never pass one to
 * `new Date(string)` or compare them as strings — use the day number.
 */
const BUSINESS_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;

/** Days since the epoch for a strict `dd-MM-yyyy` calendar date, or null. */
export function businessDateDay(value: string): number | null {
  const match = BUSINESS_DATE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time / DAY_MS
    : null;
}

/** `<input type="date">` value (`yyyy-MM-dd`) → `dd-MM-yyyy`, or null if it isn't a real date. */
export function isoToBusinessDate(iso: string): string | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const candidate = `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}`;
  return businessDateDay(candidate) === null ? null : candidate;
}

/** The day after a business date, as an `<input type="date">` value (for `min`). */
export function nextBusinessDateIso(value: string): string | null {
  const day = businessDateDay(value);
  return day === null ? null : new Date((day + 1) * DAY_MS).toISOString().slice(0, 10);
}
