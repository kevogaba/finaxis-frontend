import type { ComponentProps, SyntheticEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { WizardForm, type WizardStep } from './wizard-form';

const STEPS: WizardStep[] = [
  { label: 'Institution', helper: 'Identity and locale' },
  { label: 'Administrator', helper: 'The first user' },
  { label: 'Review', helper: 'Check everything' },
];

function wizard(active: number, props: Partial<ComponentProps<typeof WizardForm>> = {}) {
  return (
    <WizardForm
      label="Create tenant draft"
      steps={STEPS}
      active={active}
      onSubmit={(event) => {
        event.preventDefault();
      }}
      onBack={vi.fn()}
      cancelHref="/platform-admin/tenants"
      submitLabel="Create draft"
      pending={false}
      {...props}
    >
      <input aria-label="Field" />
    </WizardForm>
  );
}

describe('WizardForm', () => {
  it('renders the themed stepper, marking the current step and the completed ones', () => {
    renderWithProviders(wizard(1));

    const list = screen.getByRole('list');
    // The theme's cell grid (jsdom resolves emotion's base rules; the md row is a media query).
    expect(getComputedStyle(list).display).toBe('grid');
    const items = within(list).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Institution (completed)');
    expect(items[2]).not.toHaveTextContent('(completed)');
    expect(screen.getByRole('form', { name: 'Create tenant draft' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Administrator' })).toBeInTheDocument();
  });

  it('offers Back after the first step, Continue until the last, and Cancel back to the list', () => {
    const { rerender } = renderWithProviders(wizard(0));

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants',
    );

    rerender(wizard(2));
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create draft' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('moves focus to the new step heading on a step change, never on mount', () => {
    const { rerender } = renderWithProviders(wizard(0));
    expect(screen.getByRole('heading', { level: 2, name: 'Institution' })).not.toHaveFocus();

    rerender(wizard(1));
    expect(screen.getByRole('heading', { level: 2, name: 'Administrator' })).toHaveFocus();
  });

  it('submits and goes back through its callbacks, and locks navigation while pending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onBack = vi.fn();
    const { rerender } = renderWithProviders(wizard(1, { onSubmit, onBack }));

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(wizard(1, { onSubmit, onBack, pending: true }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true');
  });
});
