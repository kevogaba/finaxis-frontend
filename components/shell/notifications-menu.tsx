'use client';

/** One line in the notifications popover, with its link (spec §8). */
export interface NotificationEntry {
  id: string;
  text: string;
  href: string;
  linkLabel: string;
}

export interface NotificationsMenuProps {
  /** The bell's accessible name: it carries the count, or says the count couldn't be read. */
  label: string;
  /** `null` when the count couldn't be read: the menu says so, never "none". */
  total: number | null;
  entries: readonly NotificationEntry[];
  emptyText: string;
  unavailableText: string;
}
