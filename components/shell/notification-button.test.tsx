import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { NotificationButton } from './notification-button';

describe('NotificationButton', () => {
  it('shows a badge count and opens a popover with placeholder text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationButton />);

    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText(/notifications will appear here/i)).toBeInTheDocument();
  });
});
