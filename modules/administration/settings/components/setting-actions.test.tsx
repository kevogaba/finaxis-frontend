import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ActionResult } from '@/lib/api/action-result';

const { updateSetting, resetSetting } = vi.hoisted(() => ({
  updateSetting: vi.fn((_previous: ActionResult | null, _formData: FormData) =>
    Promise.resolve<ActionResult>({ ok: true }),
  ),
  resetSetting: vi.fn((_previous: ActionResult | null, _formData: FormData) =>
    Promise.resolve<ActionResult>({ ok: true }),
  ),
}));
vi.mock('../settings-actions', () => ({ updateSetting, resetSetting }));

const { SettingActions } = await import('./setting-actions');

const BLOCKED = "Editing isn't available yet.";

describe('SettingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ships Edit disabled with its reason as the description, and still offers Reset', () => {
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        value="Africa/Nairobi"
        reset
        label="Default timezone"
        editBlocked={BLOCKED}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    // describeChild: the reason is the wrapper's title, never an aria-label on a generic span.
    expect(screen.getByTitle(BLOCKED)).toContainElement(edit);
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeEnabled();
  });

  it('resets with the key and an optional reason, then toasts', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        value="Africa/Nairobi"
        reset
        label="Default timezone"
        editBlocked={BLOCKED}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset default timezone?' });
    // Edit is blocked, so the reset can't be undone in the product: the dialog says so.
    expect(dialog).toHaveTextContent("you won't be able to set a new value here afterwards");
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason (optional)' }), 'Default');
    await user.click(within(dialog).getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(resetSetting).toHaveBeenCalledTimes(1);
    });
    const formData = resetSetting.mock.calls[0]?.[1];
    expect(formData?.get('key')).toBe('default_timezone');
    expect(formData?.get('reason')).toBe('Default');
    expect(await screen.findByText('Default timezone reset to default')).toBeInTheDocument();
  });

  it('edits from the runtime list with the current value selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="base_currency"
        value="KES"
        reset={false}
        label="Base currency"
        editBlocked={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit base currency' });
    const select = within(dialog).getByRole('combobox', { name: 'Currency' });
    expect(select).toHaveValue('KES');
    await user.selectOptions(select, 'UGX');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(1);
    });
    const formData = updateSetting.mock.calls[0]?.[1];
    expect(formData?.get('key')).toBe('base_currency');
    expect(formData?.get('value')).toBe('UGX');
  });

  // I2 (controller ruling): a mutation must never silently reach the other organisation once the
  // user has switched context in another tab. `runServerAction`'s guard reads this hidden field
  // itself; here we only pin that SettingActions threads the prop through to the dialog it opens.
  it('threads contextOrganisationId through to the reset dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        value="Africa/Nairobi"
        reset
        label="Default timezone"
        editBlocked={BLOCKED}
        contextOrganisationId="org-1"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset default timezone?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(resetSetting).toHaveBeenCalledTimes(1);
    });
    expect(resetSetting.mock.calls[0]?.[1]?.get('contextOrganisationId')).toBe('org-1');
  });

  // I3 (controller ruling, 07's pattern): a successful Reset flips `reset` to false, unmounting
  // the Reset button and its dialog. With nothing left focused, focus falls to <body> unless
  // SettingActions recovers it. `SettingRow`'s role="group" Box (mimicked here by the wrapper) is
  // the tabIndex={-1} fallback when Edit itself is disabled.
  describe('focus after a successful reset', () => {
    it('focuses the row when Edit stays blocked', async () => {
      const { rerender } = renderWithProviders(
        <div role="group" aria-label="Default timezone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            value="Africa/Nairobi"
            reset
            label="Default timezone"
            editBlocked={BLOCKED}
          />
        </div>,
      );

      rerender(
        <div role="group" aria-label="Default timezone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            value={null}
            reset={false}
            label="Default timezone"
            editBlocked={BLOCKED}
          />
        </div>,
      );

      await waitFor(() => {
        expect(screen.getByRole('group', { name: 'Default timezone' })).toHaveFocus();
      });
    });

    it('focuses Edit once editing ships', async () => {
      const { rerender } = renderWithProviders(
        <div role="group" aria-label="Default timezone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            value="Africa/Nairobi"
            reset
            label="Default timezone"
            editBlocked={null}
          />
        </div>,
      );

      rerender(
        <div role="group" aria-label="Default timezone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            value={null}
            reset={false}
            label="Default timezone"
            editBlocked={null}
          />
        </div>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });
  });
});
