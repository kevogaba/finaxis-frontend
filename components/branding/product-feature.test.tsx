import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import { renderWithProviders } from '@/test/test-utils';
import { ProductFeature } from './product-feature';

describe('ProductFeature', () => {
  it('renders the capability label with a decorative icon', () => {
    renderWithProviders(<ProductFeature icon={GroupsOutlined} label="Membership" />);

    expect(screen.getByText('Membership')).toBeInTheDocument();
    const icon = document.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });
});
