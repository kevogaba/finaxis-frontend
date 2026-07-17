import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { AppProviders } from '@/components/providers/app-providers';

function Providers({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react';
