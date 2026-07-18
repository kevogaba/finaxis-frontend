import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { AppSwitcher } from './app-switcher';

describe('AppSwitcher', () => {
  it('opens on click and shows Administration as active', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    await user.click(screen.getByRole('button', { name: /switch application/i }));

    const administration = screen.getByRole('menuitem', { name: /administration/i });
    expect(administration).toHaveAttribute('aria-disabled', 'false');
  });

  it('disables modules that are not yet available', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    await user.click(screen.getByRole('button', { name: /switch application/i }));

    const membership = screen.getByRole('menuitem', { name: /membership/i });
    expect(membership).toHaveAttribute('aria-disabled', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppSwitcher />);

    const trigger = screen.getByRole('button', { name: /switch application/i });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
