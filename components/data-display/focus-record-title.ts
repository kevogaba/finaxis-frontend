/**
 * I3's last-resort focus target (07's business-date actions, 08's PF6): the record page's `h1`,
 * for when an action leaves no trigger to return focus to. `RecordHero` (frozen kit) exposes no
 * ref, so this finds the heading by DOM query and makes it focusable. Client-only.
 * ponytail: DOM-query ceiling — a RecordHero focus-target prop (refactor(kit)) replaces it if
 * the query ever finds the wrong heading.
 */
export function focusRecordTitle(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}
