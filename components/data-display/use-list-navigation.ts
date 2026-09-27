import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Next keeps rendering the old URL until a push commits, and a later push discards a pending one.
// So a push made while another is in flight (e.g. a pagination click right after a date field's
// blur) builds on that pending query, not the stale rendered one.
// ponytail: only list controls that navigate through this hook are covered; server-built hrefs
// (audit row detail/actor links, the drawer's closeHref, 'Clear filters') still discard an
// in-flight blur commit. Upgrade path: an explicit Enter/Apply commit on the date fields.
let pending: { from: string; to: string } | null = null;

/** Rewrites the current list's query string and pushes it without scrolling. */
export function useListNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  // A committed URL change (a push landing, Back/Forward) or a mount ends the in-flight push.
  useEffect(() => {
    pending = null;
  }, [query]);

  return (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(pending?.from === query ? pending.to : query);
    update(params);
    const to = params.toString();
    pending = { from: query, to };
    router.push(to ? `${pathname}?${to}` : pathname, { scroll: false });
  };
}
