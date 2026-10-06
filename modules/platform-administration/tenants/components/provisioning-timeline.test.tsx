import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { provisioningTimeline } from '../tenant-rules';
import { FAILURE_CODE_NOTE, ProvisioningTimeline } from './provisioning-timeline';

describe('ProvisioningTimeline', () => {
  it('lists the steps in order, each with a worded chip, and shows the failure code', () => {
    renderWithProviders(
      <ProvisioningTimeline
        steps={provisioningTimeline('ACTIVE', 'FAILED') ?? []}
        failureCode="KEYCLOAK_UNAVAILABLE"
      />,
    );

    const steps = within(screen.getByRole('list', { name: 'Provisioning steps' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('1. Draft created');
    expect(steps[0]).toHaveTextContent('Done');
    expect(steps[3]).toHaveTextContent('4. First administrator provisioned');
    expect(steps[3]).toHaveTextContent('Failed');
    expect(screen.getByText('KEYCLOAK_UNAVAILABLE')).toBeInTheDocument();
  });

  it('explains the failure code in words', () => {
    renderWithProviders(
      <ProvisioningTimeline
        steps={provisioningTimeline('ACTIVE', 'FAILED') ?? []}
        failureCode="KEYCLOAK_UNAVAILABLE"
      />,
    );

    expect(screen.getByText(FAILURE_CODE_NOTE)).toBeInTheDocument();
    expect(screen.getByText('KEYCLOAK_UNAVAILABLE')).toBeInTheDocument();
  });
});
