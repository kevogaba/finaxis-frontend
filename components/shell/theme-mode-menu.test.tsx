import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ThemeModeMenu } from './theme-mode-menu';

describe('ThemeModeMenu', () => {
  it('exposes System default, Light, and Dark options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeModeMenu />);

    await user.click(screen.getByRole('button', { name: /theme/i }));

    expect(screen.getByRole('menuitemradio', { name: /system default/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /^light$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /^dark$/i })).toBeInTheDocument();
  });

  it('marks the selected mode and updates the color scheme on selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeModeMenu />);

    await user.click(screen.getByRole('button', { name: /theme/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /^dark$/i }));

    expect(document.documentElement).toHaveClass('dark');

    await user.click(screen.getByRole('button', { name: /theme/i }));
    expect(screen.getByRole('menuitemradio', { name: /^dark$/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
