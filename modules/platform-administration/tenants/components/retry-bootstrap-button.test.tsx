import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RetryBootstrapButton } from './retry-bootstrap-button';

const { retryTenantBootstrap } = vi.hoisted(() => ({ retryTenantBootstrap: vi.fn() }));
vi.mock('../tenant-actions', () => ({
  retryTenantBootstrap: (...args: unknown[]) => retryTenantBootstrap(...args) as unknown,
}));

const ID = '16000000-0000-4000-8000-000000000004';
const ORG_ID = '00000000-0000-0000-0000-000000000000';
const NAME = 'Pwani Fishermen SACCO';

describe('RetryBootstrapButton', () => {
  it('retries with the tenant id and the rendered organisation, then focuses the title', async () => {
    const user = userEvent.setup();
    retryTenantBootstrap.mockResolvedValueOnce({ ok: true });
    const { rerender } = renderWithProviders(
      <main>
        <h1>{NAME}</h1>
        <RetryBootstrapButton tenantId={ID} tenantName={NAME} contextOrganisationId={ORG_ID} />
      </main>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry bootstrap' }));
    const dialog = screen.getByRole('dialog', { name: `Retry ${NAME}'s bootstrap?` });
    await user.click(within(dialog).getByRole('button', { name: 'Retry bootstrap' }));

    await waitFor(() => {
      expect(retryTenantBootstrap).toHaveBeenCalledTimes(1);
    });
    const formData = retryTenantBootstrap.mock.calls[0]?.[1] as FormData;
    expect(formData.get('tenantId')).toBe(ID);
    expect(formData.get('contextOrganisationId')).toBe(ORG_ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bootstrap retry started');

    // The bootstrap left FAILED, so the page drops the button.
    rerender(
      <main>
        <h1>{NAME}</h1>
      </main>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NAME })).toHaveFocus();
    });
  });
});
