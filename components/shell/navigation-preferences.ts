/**
 * The rail's collapse preference, persisted in a cookie (not localStorage) so the server renders
 * the right width on first paint. Read in app/(authenticated)/layout.tsx; written by AppShell.
 * No 'use client' directive: the server layout imports the constants.
 */
export const NAV_COLLAPSED_COOKIE = 'finaxis_nav';
export const NAV_COLLAPSED_VALUE = 'collapsed';

export function writeNavCollapsed(collapsed: boolean): void {
  document.cookie = collapsed
    ? `${NAV_COLLAPSED_COOKIE}=${NAV_COLLAPSED_VALUE}; path=/; max-age=31536000; samesite=lax`
    : `${NAV_COLLAPSED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
