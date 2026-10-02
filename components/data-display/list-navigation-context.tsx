'use client';

import { createContext, useContext, useTransition, type ReactNode } from 'react';

interface ListNavigationContextValue {
  startTransition: (callback: () => void) => void;
  isPending: boolean;
}

const ListNavigationContext = createContext<ListNavigationContextValue | null>(null);

/**
 * Shares one `useTransition` between every `useListNavigation()` caller under it — the filter
 * toolbar and the pagination bar each call the hook independently, and only one shared instance
 * lets a pagination click reflect a still-in-flight filter navigation (and vice versa) in a
 * single `isPending` flag.
 */
export function ListNavigationProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <ListNavigationContext.Provider value={{ startTransition, isPending }}>
      {children}
    </ListNavigationContext.Provider>
  );
}

export function useListNavigationContext(): ListNavigationContextValue | null {
  return useContext(ListNavigationContext);
}
