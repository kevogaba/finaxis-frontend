import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ProfileSection } from './profile-section';

describe('ProfileSection', () => {
  it('is a section landmark named by its h2, with a description and actions', () => {
    renderWithProviders(
      <ProfileSection title="Identity" description="Who you are" actions={<button>Do it</button>}>
        <p>Body</p>
      </ProfileSection>,
    );

    const region = screen.getByRole('region', { name: 'Identity' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Who you are');
    expect(region).toHaveTextContent('Body');
    expect(within(region).getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });
});
