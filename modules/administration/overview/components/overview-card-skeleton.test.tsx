import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { OverviewCardSkeleton } from './overview-card-skeleton';

const DESCRIPTION = 'Requests waiting for a decision, newest first.';

/** Each placeholder line of a skeleton: two per row, one per bar block line. */
function placeholders(card: HTMLElement) {
  return card.querySelectorAll('[aria-busy="true"] .MuiSkeleton-root');
}

describe('OverviewCardSkeleton', () => {
  it('names the card, shows its description at once and marks its body busy', () => {
    renderWithProviders(
      <OverviewCardSkeleton title="Pending approvals" description={DESCRIPTION} rows={5} />,
    );

    const card = screen.getByRole('region', { name: 'Pending approvals' });
    expect(
      within(card).getByRole('heading', { level: 2, name: 'Pending approvals' }),
    ).toBeVisible();
    expect(within(card).getByText(DESCRIPTION)).toBeVisible();
    expect(card.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('says it is loading inside the busy body, visually hidden', () => {
    renderWithProviders(
      <OverviewCardSkeleton title="Recent activity" description="The latest events." rows={5} />,
    );

    const loading = screen.getByText('Loading…');
    expect(loading).toHaveClass('sr-only');
    expect(loading.closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders as many row placeholders as its count asks for', () => {
    renderWithProviders(
      <OverviewCardSkeleton title="Recent activity" description="The latest events." rows={5} />,
    );

    expect(placeholders(screen.getByRole('region', { name: 'Recent activity' }))).toHaveLength(10);
  });

  it('renders one row for Business date and a bar block above the rows for Readiness', () => {
    renderWithProviders(
      <>
        <OverviewCardSkeleton title="Business date" description="The date." rows={1} />
        <OverviewCardSkeleton
          title="Operational readiness"
          description="Each item is computed."
          rows={5}
          bar
        />
      </>,
    );

    expect(placeholders(screen.getByRole('region', { name: 'Business date' }))).toHaveLength(2);
    expect(
      placeholders(screen.getByRole('region', { name: 'Operational readiness' })),
    ).toHaveLength(12);
  });
});
