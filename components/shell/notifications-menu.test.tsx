import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import {
  PENDING_HREF,
  pendingApprovalNotifications,
} from '@/modules/platform-administration/overview/overview-rules';
import { renderWithProviders } from '@/test/test-utils';
import { NotificationsMenu } from './notifications-menu';

const PROPS = pendingApprovalNotifications(2);

describe('NotificationsMenu', () => {
  it('names the bell with its count and shows a badge above zero', () => {
    renderWithProviders(<NotificationsMenu {...PROPS} />);

    const bell = screen.getByRole('button', {
      name: 'Notifications: 2 institutions waiting for approval',
    });
    expect(within(bell).getByText('2')).toBeInTheDocument();
  });

  it('opens a named dialog with its entries; Escape closes it and returns focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsMenu {...PROPS} />);

    const bell = screen.getByRole('button', { name: /^Notifications/ });
    await user.click(bell);

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      within(dialog).getByText('2 institutions are waiting for approval.'),
    ).toBeInTheDocument();
    // The Pending approval tile's list: the same name goes to the same place (rule 12).
    expect(
      within(dialog).getByRole('link', { name: 'Review pending institutions' }),
    ).toHaveAttribute('href', PENDING_HREF);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(bell).toHaveFocus();
    });
  });

  it('closes the dialog when an entry is followed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsMenu {...PROPS} />);
    // jsdom cannot navigate: cancel the anchor's default action after React's handlers have run.
    const keepPage = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener('click', keepPage);
    try {
      await user.click(screen.getByRole('button', { name: /^Notifications/ }));
      const dialog = screen.getByRole('dialog', { name: 'Notifications' });
      await user.click(within(dialog).getByRole('link', { name: 'Review pending institutions' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      document.removeEventListener('click', keepPage);
    }
  });

  it('announces that it opens a dialog, and whether it is open', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsMenu {...PROPS} />);

    const bell = screen.getByRole('button', { name: /^Notifications/ });
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell).not.toHaveAttribute('aria-expanded');

    await user.click(bell);

    await waitFor(() => {
      expect(bell).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('hides the badge at zero and says nothing is waiting', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <NotificationsMenu {...pendingApprovalNotifications(0)} />,
    );

    const bell = screen.getByRole('button', { name: 'Notifications: nothing waiting' });
    expect(container.querySelector('.MuiBadge-invisible')).not.toBeNull();
    expect(within(bell).queryByText('0')).toBeNull();

    await user.click(bell);

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      within(dialog).getByText('No institutions are waiting for approval.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it("says the count couldn't be loaded, never none", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <NotificationsMenu {...pendingApprovalNotifications(null)} />,
    );

    const bell = screen.getByRole('button', { name: "Notifications (couldn't be loaded)" });
    expect(container.querySelector('.MuiBadge-invisible')).not.toBeNull();

    await user.click(bell);

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      within(dialog).getByText("Pending approvals couldn't be loaded. Refresh to try again."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('No institutions are waiting for approval.')).toBeNull();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('caps the badge at 99+', () => {
    renderWithProviders(<NotificationsMenu {...pendingApprovalNotifications(150)} />);

    const bell = screen.getByRole('button', {
      name: 'Notifications: 150 institutions waiting for approval',
    });
    expect(within(bell).getByText('99+')).toBeInTheDocument();
  });
});
