import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { INVITATION_NOTE } from '../invite-rules';
import { EMPTY_INVITE, type InviteValues } from '../invite-schema';
import { InviteInvitationFields } from './invite-invitation-fields';

function Harness({ onValues }: { onValues: (values: InviteValues) => void }) {
  const { control, getValues } = useForm<InviteValues>({ defaultValues: EMPTY_INVITE });
  return (
    <form>
      <InviteInvitationFields control={control} />
      <button
        type="button"
        onClick={() => {
          onValues(getValues());
        }}
      >
        Read
      </button>
    </form>
  );
}

describe('InviteInvitationFields', () => {
  it('starts with the identity-provider invitation on and the application invitation off', () => {
    renderWithProviders(<Harness onValues={() => undefined} />);

    const identity = screen.getByRole('checkbox', {
      name: 'Send the identity-provider invitation',
    });
    expect(identity).toBeChecked();
    expect(identity).toHaveAccessibleDescription(
      'After approval, once their sign-in identity is created, the identity provider emails them to verify their address.',
    );
    const application = screen.getByRole('checkbox', { name: 'Send the application invitation' });
    expect(application).not.toBeChecked();
    expect(application).toHaveAccessibleDescription(
      "Also sends them the application's own invitation email.",
    );
    // BG-25: a note, not an alert, so a screen reader isn't interrupted.
    expect(screen.getByRole('note')).toHaveTextContent(INVITATION_NOTE);
  });

  it("keeps each flag as the form's 'true' or 'false'", async () => {
    const user = userEvent.setup({ delay: null });
    let values: InviteValues | null = null;
    renderWithProviders(
      <Harness
        onValues={(read) => {
          values = read;
        }}
      />,
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Send the application invitation' }));
    await user.click(screen.getByRole('button', { name: 'Read' }));

    expect(values).toMatchObject({ sendIdentityInvite: 'false', sendApplicationInvite: 'true' });
  });
});
