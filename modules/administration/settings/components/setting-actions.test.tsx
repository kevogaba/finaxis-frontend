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

const { SettingActions, SettingSwitch } = await import('./setting-actions');

const sent = (mock: typeof updateSetting, call = 0) => mock.mock.calls[call]?.[1];
const FAILED: ActionResult = {
  ok: false,
  formError: 'Some details weren’t accepted.',
  fieldErrors: {},
  code: 'conflict',
  requestId: null,
};

describe('SettingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits the time zone from a searchable list, with the current zone chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        label="Default time zone"
        value="Africa/Nairobi"
        reset={false}
        contextOrganisationId="org-1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit default time zone' });
    const zone = within(dialog).getByRole('combobox', { name: 'Time zone' });
    expect(zone).toHaveValue('Africa/Nairobi');
    expect(zone).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();

    await user.clear(zone);
    await user.type(zone, 'Kampala');
    await user.click(screen.getByRole('option', { name: 'Africa/Kampala' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(1);
    });
    expect(sent(updateSetting)?.get('key')).toBe('default_timezone');
    expect(sent(updateSetting)?.get('value')).toBe('Africa/Kampala');
    expect(sent(updateSetting)?.get('contextOrganisationId')).toBe('org-1');
    expect(await screen.findByText('Default time zone updated')).toBeInTheDocument();
  });

  it('offers no raw offset, and keeps a stored zone the list lacks', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="default_timezone"
        label="Default time zone"
        value="Etc/GMT-3"
        reset
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const zone = screen.getByRole('combobox', { name: 'Time zone' });
    expect(zone).toHaveValue('Etc/GMT-3');
    await user.clear(zone);
    await user.type(zone, '+03');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('resets with the key and an optional reason, then toasts', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingActions
        settingKey="require_maker_checker_for_branch_creation"
        label="Require maker-checker for branch creation"
        value="false"
        reset
      />,
    );
    // A switch edits itself, so its row offers Reset only.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Reset require maker-checker for branch creation?',
    });
    expect(dialog).toHaveTextContent(
      "The stored value is removed, so the platform's default applies again.",
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason (optional)' }), 'Default');
    await user.click(within(dialog).getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(resetSetting).toHaveBeenCalledTimes(1);
    });
    expect(sent(resetSetting)?.get('key')).toBe('require_maker_checker_for_branch_creation');
    expect(sent(resetSetting)?.get('reason')).toBe('Default');
    expect(
      await screen.findByText('Require maker-checker for branch creation reset to default'),
    ).toBeInTheDocument();
  });

  // I3: a successful Reset unmounts the Reset button and its dialog, so focus would fall to <body>.
  describe('focus after a successful reset', () => {
    it('lands on Edit when the row has one', async () => {
      const { rerender } = renderWithProviders(
        <div role="group" aria-label="Default time zone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            label="Default time zone"
            value="UTC"
            reset
          />
        </div>,
      );
      rerender(
        <div role="group" aria-label="Default time zone" tabIndex={-1}>
          <SettingActions
            settingKey="default_timezone"
            label="Default time zone"
            value={null}
            reset={false}
          />
        </div>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });

    it('lands on the row when the row has no Edit', async () => {
      const key = 'require_maker_checker_for_user_invites';
      const name = 'Require maker-checker for user invitations';
      const { rerender } = renderWithProviders(
        <div role="group" aria-label={name} tabIndex={-1}>
          <SettingActions settingKey={key} label={name} value="false" reset />
        </div>,
      );
      rerender(
        <div role="group" aria-label={name} tabIndex={-1}>
          <SettingActions settingKey={key} label={name} value="true" reset={false} />
        </div>,
      );

      await waitFor(() => {
        expect(screen.getByRole('group', { name })).toHaveFocus();
      });
    });
  });
});

describe('SettingSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const invites = {
    settingKey: 'require_maker_checker_for_user_invites',
    label: 'Require maker-checker for user invitations',
  } as const;

  it('asks for a reason, and says what it relaxes, before turning maker-checker off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingSwitch {...invites} checked edit blocked={null} />);

    await user.click(screen.getByRole('switch', { name: invites.label }));
    const dialog = screen.getByRole('dialog', {
      name: 'Turn off maker-checker for user invitations?',
    });
    expect(dialog).toHaveAccessibleDescription(
      "The person who invites someone will be able to approve them, and the invited person will be able to approve their own membership. Each such approval is recorded as a high-severity event. The platform's own checks still apply.",
    );
    // Nothing changes until it is confirmed (the open dialog hides the page from the tree).
    expect(screen.getByRole('switch', { name: invites.label, hidden: true })).toBeChecked();
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('minlength', '3');

    await user.type(reason, 'Two-person team');
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(1);
    });
    expect(sent(updateSetting)?.get('key')).toBe(invites.settingKey);
    expect(sent(updateSetting)?.get('value')).toBe('false');
    expect(sent(updateSetting)?.get('reason')).toBe('Two-person team');
    expect(
      await screen.findByText('Maker-checker for user invitations turned off'),
    ).toBeInTheDocument();
  });

  it('turns a switch on with an optional reason', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingSwitch
        settingKey="business_date_auto_advance_enabled"
        label="Advance the business date automatically"
        checked={false}
        edit
        blocked={null}
      />,
    );

    await user.click(
      screen.getByRole('switch', { name: 'Advance the business date automatically' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Turn on automatic business date advance?' });
    expect(within(dialog).getByRole('textbox', { name: 'Reason (optional)' })).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(1);
    });
    expect(sent(updateSetting)?.get('value')).toBe('true');
  });

  it('reuses the minted idempotency key on a retry, and mints a new one after a success', async () => {
    const user = userEvent.setup();
    updateSetting.mockResolvedValueOnce(FAILED);
    renderWithProviders(<SettingSwitch {...invites} checked={false} edit blocked={null} />);

    await user.click(screen.getByRole('switch', { name: invites.label }));
    const dialog = screen.getByRole('dialog', {
      name: 'Turn on maker-checker for user invitations?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(await within(dialog).findByText(/weren’t accepted/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(2);
    });
    const first = sent(updateSetting, 0)?.get('idempotencyKey');
    expect(first).toEqual(expect.any(String));
    expect(sent(updateSetting, 1)?.get('idempotencyKey')).toBe(first);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await user.click(screen.getByRole('switch', { name: invites.label }));
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(3);
    });
    expect(sent(updateSetting, 2)?.get('idempotencyKey')).not.toBe(first);
  });

  it('shows a switch it may not change disabled, with the reason when there is one', () => {
    renderWithProviders(
      <>
        <SettingSwitch {...invites} checked edit={false} blocked={null} />
        <SettingSwitch
          settingKey="business_date_auto_advance_enabled"
          label="Advance the business date automatically"
          checked={false}
          edit
          blocked="Turning on automatic advance needs permission to advance the business date."
        />
      </>,
    );

    expect(screen.getByRole('switch', { name: invites.label })).toBeDisabled();
    const advance = screen.getByRole('switch', { name: 'Advance the business date automatically' });
    expect(advance).toBeDisabled();
    expect(advance).toHaveAccessibleDescription(
      'Turning on automatic advance needs permission to advance the business date.',
    );
    expect(screen.getByText('Off')).toBeInTheDocument();
  });
});
