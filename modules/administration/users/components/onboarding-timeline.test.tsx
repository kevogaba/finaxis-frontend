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

  it('adds the provisioning note under the steps', () => {
    renderWithProviders(
      <OnboardingTimeline progress={onboardingProgress('PENDING_APPROVAL', 'PROVISIONING_IDP')} />,
    );

    expect(screen.getByRole('list', { name: 'Onboarding steps' })).toBeInTheDocument();
    expect(screen.getByText(PROVISIONING_NOTE)).toBeInTheDocument();
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
