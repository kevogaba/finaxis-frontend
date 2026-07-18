'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ApplicationContext } from '@/config/application-context';

const ApplicationContextReactContext = createContext<ApplicationContext | null>(null);

interface ApplicationContextProviderProps {
  value: ApplicationContext;
  children: ReactNode;
}

export function ApplicationContextProvider({ value, children }: ApplicationContextProviderProps) {
  return (
    <ApplicationContextReactContext.Provider value={value}>
      {children}
    </ApplicationContextReactContext.Provider>
  );
}

export function useApplicationContext(): ApplicationContext {
  const context = useContext(ApplicationContextReactContext);
  if (!context) {
    throw new Error('useApplicationContext must be used within an ApplicationContextProvider.');
  }
  return context;
}
