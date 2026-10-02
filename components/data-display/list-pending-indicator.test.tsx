import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ListNavigationProvider } from './list-navigation-context';
import { ListBusyRegion, ListNavigationProgress } from './list-pending-indicator';

describe('list pending indicator (idle state)', () => {
  it('renders no progressbar and aria-busy="false" while idle', () => {
    renderWithProviders(
      <ListNavigationProvider>
        <ListNavigationProgress />
        <ListBusyRegion>
          <p>content</p>
        </ListBusyRegion>
      </ListNavigationProvider>,
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('content').parentElement).toHaveAttribute('aria-busy', 'false');
  });
});
