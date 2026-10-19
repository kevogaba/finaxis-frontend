import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UserMenu } from './user-menu';
import type { FinaxisUser } from '@/auth/auth.types';

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  permissions: [],
  roles: [],
  branches: [],
};

describe('UserMenu', () => {
  it('displays the signed-in user name and email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /jane muthoni/i }));

    const menu = within(screen.getByRole('menu'));
    expect(menu.getByText('Jane Muthoni')).toBeInTheDocument();
    expect(menu.getByText('jane.muthoni@finaxis.test')).toBeInTheDocument();
  });

  it('opens and closes via keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    const trigger = screen.getByRole('button', { name: /jane muthoni/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: /view profile/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows initials when no image is present', () => {
    renderWithProviders(<UserMenu user={USER} />);
    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('names its button by what it shows, in order (WCAG 2.5.3): the initials, the name, the email', () => {
    renderWithProviders(<UserMenu user={USER} />);

    const trigger = screen.getByRole('button', {
      name: 'JM Jane Muthoni jane.muthoni@finaxis.test',
    });
    // The words are separate text nodes, so a rule that reads the visible text sees three words, not one.
    expect(trigger.textContent).toBe('JM Jane Muthoni jane.muthoni@finaxis.test');
  });

  it('leaves the initials out of the name when a picture shows instead', () => {
    renderWithProviders(<UserMenu user={{ ...USER, image: 'https://example.test/jane.png' }} />);

    expect(
      screen.getByRole('button', { name: 'Jane Muthoni jane.muthoni@finaxis.test' }),
    ).toBeInTheDocument();
  });

  it('disables the log-out action after the first click to prevent duplicate submissions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /jane muthoni/i }));
    const logOutButton = screen.getByRole('button', { name: /log out/i });
    await user.click(logOutButton);

    expect(logOutButton).toBeDisabled();
  });
});
