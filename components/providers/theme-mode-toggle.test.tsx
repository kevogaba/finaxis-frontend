import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ThemeModeToggle } from './theme-mode-toggle';

describe('ThemeModeToggle', () => {
  it('renders light, system and dark options', () => {
    renderWithProviders(<ThemeModeToggle />);

    expect(screen.getByRole('button', { name: /light mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /match system theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark mode/i })).toBeInTheDocument();
  });

  it('marks the selected mode as pressed when chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeModeToggle />);

    const darkButton = screen.getByRole('button', { name: /dark mode/i });
    await user.click(darkButton);

    expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  });
});
