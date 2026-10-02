import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { SwitchContextButton } from './switch-context-button';

vi.mock('@/components/shell/context-switcher-dialog', () => ({
  ContextSwitcherDialog: ({
    open,
    onClose,
    platformOrganisationId,
  }: {
    open: boolean;
    onClose: () => void;
    platformOrganisationId: string;
  }) =>
    open ? (
      <div role="dialog" aria-label="Switch working context">
        {platformOrganisationId}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe('SwitchContextButton', () => {
  it('opens the shared context dialog and closes it again', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SwitchContextButton platformOrganisationId="platform-org" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch context' }));
    expect(screen.getByRole('dialog', { name: 'Switch working context' })).toHaveTextContent(
      'platform-org',
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
