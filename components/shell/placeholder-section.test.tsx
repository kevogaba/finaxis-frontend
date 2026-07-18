import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { PlaceholderSection } from './placeholder-section';

describe('PlaceholderSection', () => {
  it('renders the label and the empty-state message', () => {
    renderWithProviders(
      <PlaceholderSection
        label="User management"
        emptyStateMessage="User management will let you invite staff and assign roles."
      />,
    );

    expect(screen.getByText(/user management isn't available yet/i)).toBeInTheDocument();
    expect(
      screen.getByText('User management will let you invite staff and assign roles.'),
    ).toBeInTheDocument();
  });
});
