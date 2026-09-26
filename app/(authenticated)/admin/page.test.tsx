import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import AdminOverviewPage from './page';

describe('AdminOverviewPage', () => {
  it('renders the Administration Overview heading', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeInTheDocument();
  });

  it('renders no sample or placeholder data', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
