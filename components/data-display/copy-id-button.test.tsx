import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CopyIdButton } from './copy-id-button';

const ID = '44444444-4444-4444-8444-444444444444';

describe('CopyIdButton', () => {
  it('shows the short ID, keeps the full value in its title, and copies the full value', async () => {
    const user = userEvent.setup(); // installs a clipboard stub on navigator
    renderWithProviders(<CopyIdButton value={ID} label="Branch ID" />);

    expect(screen.getByText('44444444')).toHaveAttribute('title', ID);
    await user.click(screen.getByRole('button', { name: 'Copy Branch ID' }));

    await expect(navigator.clipboard.readText()).resolves.toBe(ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch ID copied');
  });

  it('explains a blocked clipboard instead of failing silently', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    renderWithProviders(<CopyIdButton value={ID} />);

    await user.click(screen.getByRole('button', { name: 'Copy ID' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't copy the ID. The full ID is now shown. Select it and copy it.",
    );
    // The toast tells the user to select and copy it themselves, so the full value must be shown.
    expect(screen.getByText(ID)).toBeInTheDocument();
  });
});
