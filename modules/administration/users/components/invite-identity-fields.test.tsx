import { describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { IDENTITY_FIELDS } from '../invite-rules';
import { EMPTY_INVITE, inviteSchema, type InviteValues } from '../invite-schema';
import { InviteIdentityFields } from './invite-identity-fields';

/** The step inside its own form, validated as the wizard's Continue does. */
function Harness() {
  const {
    control,
    register,
    trigger,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY_INVITE });
  return (
    <form>
      <InviteIdentityFields
        control={control}
        register={register}
        trigger={trigger}
        errors={errors}
      />
      <button
        type="button"
        onClick={() => {
          void trigger([...IDENTITY_FIELDS]);
        }}
      >
        Check
      </button>
    </form>
  );
}

describe('InviteIdentityFields', () => {
  it('labels each field and says what it takes', () => {
    renderWithProviders(<Harness />);

    expect(screen.getByRole('textbox', { name: 'Full name' })).toBeRequired();
    const email = screen.getByRole('textbox', { name: 'Email' });
    // The no-trim ruling relies on this: an email input strips its surrounding spaces.
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(email).toHaveAccessibleDescription(
      "We check it isn't already in use in this institution.",
    );
    expect(screen.getByRole('textbox', { name: 'Username' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAccessibleDescription(
      'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
    );
    // BG-17: the phone is stored but never readable afterwards.
    const phone = screen.getByRole('textbox', { name: 'Phone' });
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).not.toBeRequired(); // Q14: optional
    expect(phone).toHaveAccessibleDescription(
      "Optional. International format, e.g. +254712000140. It can't be viewed after the invitation is sent.",
    );
    expect(screen.getByRole('combobox', { name: 'Membership type' })).toHaveAccessibleDescription(
      "Staff and admin members need a branch; auditors and system members don't.",
    );
  });

  it('offers the four membership types', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Membership type' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Staff',
      'Admin',
      'Auditor',
      'System',
    ]);
  });

  it('adds no error line on a blur, so a click on Continue never lands on a moved page', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);

    // Typing validates nothing either: a field re-checks only once it already shows an error.
    const fullName = screen.getByRole('textbox', { name: 'Full name' });
    await user.type(fullName, 'N');
    await user.tab();

    expect(screen.queryByText('Enter a name of at least 2 characters.')).toBeNull();
  });

  it('clears a refused field’s error as soon as it is fixed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<Harness />);
    const username = screen.getByRole('textbox', { name: 'Username' });

    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => {
      expect(username).toHaveAccessibleDescription(
        'Use 3–50 letters, digits, dots, underscores or hyphens.',
      );
      expect(username).toHaveAttribute('aria-invalid', 'true');
    });

    await user.type(username, 'neema.wanjiku');
    await waitFor(() => {
      expect(username).toHaveAccessibleDescription(
        'Letters, digits, dots, underscores or hyphens, 3–50 characters.',
      );
      expect(username).toHaveAttribute('aria-invalid', 'false');
    });
  });
});
