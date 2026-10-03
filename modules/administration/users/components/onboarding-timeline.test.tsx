import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { onboardingProgress, PROVISIONING_NOTE } from '../user-rules';
import { OnboardingTimeline } from './onboarding-timeline';

describe('OnboardingTimeline', () => {
  it('lists the steps in order with worded chips', () => {
    renderWithProviders(
      <OnboardingTimeline progress={onboardingProgress('PENDING_APPROVAL', 'DRAFT')} />,
    );

    const list = screen.getByRole('list', { name: 'Onboarding steps' });
    // jsdom gives an `ol` the list role anyway, so pin the attribute itself: without it WebKit
    // drops the semantics once `listStyle: 'none'` is applied.
    expect(list).toHaveAttribute('role', 'list');
    const steps = within(list).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('1. Invited');
    expect(steps[0]).toHaveTextContent('Done');
    expect(steps[1]).toHaveTextContent('2. Approved');
    expect(steps[1]).toHaveTextContent('Waiting');
    expect(steps[2]).toHaveTextContent('3. Identity provisioned');
    expect(steps[2]).toHaveTextContent('Not started');
    expect(steps[3]).toHaveTextContent('4. First sign-in');
  });

  it("lets each step's text take the room the chip leaves, so the chip stays at the right (M4)", () => {
    renderWithProviders(
      <OnboardingTimeline progress={onboardingProgress('PENDING_APPROVAL', 'DRAFT')} />,
    );

    const steps = within(screen.getByRole('list', { name: 'Onboarding steps' })).getAllByRole(
      'listitem',
    );
    for (const step of steps) {
      // A basis of 0 never asks for more than the row holds, so the chip never wraps to a new line.
      expect(step.firstElementChild).toHaveStyle({ flexGrow: '1', flexShrink: '1' });
      expect(step.firstElementChild).toHaveStyle({ flexBasis: '0px' });
    }
  });

  it('adds the provisioning note under the steps', () => {
    renderWithProviders(
      <OnboardingTimeline progress={onboardingProgress('PENDING_APPROVAL', 'PROVISIONING_IDP')} />,
    );

    const list = screen.getByRole('list', { name: 'Onboarding steps' });
    const note = screen.getByText(PROVISIONING_NOTE);
    // Under the steps, not above them or inside the list: exactly "follows".
    expect(list.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows only the sentence once onboarding has stopped', () => {
    const progress = onboardingProgress('SUSPENDED', 'ACTIVE');
    renderWithProviders(<OnboardingTimeline progress={progress} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The membership is suspended, so they can't sign in to this institution until it's reactivated.",
      ),
    ).toBeInTheDocument();
  });
});
