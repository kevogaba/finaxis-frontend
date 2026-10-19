import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CARD_LOADING } from '../overview-rules';
import { OverviewCardSkeleton } from './overview-card-skeleton';

const DESCRIPTION = 'Requests waiting for a decision, newest first.';

/** The card's busy body: its children are the card's placeholders, in order. */
function busyBody(card: HTMLElement): HTMLElement {
  const busy = card.querySelector<HTMLElement>('[aria-busy="true"]');
  if (!busy) throw new Error('the card has no busy body');
  return busy;
}

/** Every placeholder line in the card's busy body (a text or bar skeleton). */
function lines(card: HTMLElement) {
  return busyBody(card).querySelectorAll('.MuiSkeleton-root');
}

describe('OverviewCardSkeleton', () => {
  it("names the card, shows its description and its header link's placeholder at once, and marks its body busy", () => {
    renderWithProviders(
      <OverviewCardSkeleton
        title="Pending approvals"
        description={DESCRIPTION}
        action="Open the approval queue"
        rows={5}
      />,
    );

    const card = screen.getByRole('region', { name: 'Pending approvals' });
    expect(
      within(card).getByRole('heading', { level: 2, name: 'Pending approvals' }),
    ).toBeVisible();
    expect(within(card).getByText(DESCRIPTION)).toBeVisible();
    // The link's words size a placeholder (hidden by MUI); the header offers no link while loading.
    expect(within(card).getByText('Open the approval queue')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).toBeNull();
    expect(busyBody(card)).toBeInTheDocument();
  });

  it('says it is loading just before the busy body, visually hidden, and not inside it', () => {
    renderWithProviders(
      <OverviewCardSkeleton title="Recent activity" description="The latest events." rows={5} />,
    );

    const card = screen.getByRole('region', { name: 'Recent activity' });
    const loading = within(card).getByText(CARD_LOADING);
    expect(loading).toHaveClass('sr-only');
    expect(loading.closest('[aria-busy="true"]')).toBeNull();
    expect(
      loading.compareDocumentPosition(busyBody(card)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders one placeholder row per row count, two lines each, for the card lists', () => {
    renderWithProviders(
      <OverviewCardSkeleton title="Recent activity" description="The latest events." rows={5} />,
    );

    const card = screen.getByRole('region', { name: 'Recent activity' });
    expect(busyBody(card).children).toHaveLength(5);
    expect(lines(card)).toHaveLength(10);
  });

  it("renders Business date's one date line, with no rows", () => {
    renderWithProviders(
      <OverviewCardSkeleton
        title="Business date"
        description="The date this institution is working on."
        action="Open business date"
        shape="date"
      />,
    );

    const card = screen.getByRole('region', { name: 'Business date' });
    expect(busyBody(card).children).toHaveLength(1);
    expect(lines(card)).toHaveLength(1);
  });

  it("renders Readiness's bar block first, then five items of three lines each", () => {
    renderWithProviders(
      <OverviewCardSkeleton
        title="Operational readiness"
        description="Each item is computed from live data."
        shape="readiness"
        rows={5}
      />,
    );

    const card = screen.getByRole('region', { name: 'Operational readiness' });
    const body = busyBody(card);
    expect(body.children).toHaveLength(6);
    expect(body.firstElementChild?.querySelector('.MuiSkeleton-rectangular')).not.toBeNull();
    for (const item of Array.from(body.children).slice(1)) {
      expect(item.querySelectorAll('.MuiSkeleton-root')).toHaveLength(3);
    }
    expect(lines(card)).toHaveLength(17);
  });
});
