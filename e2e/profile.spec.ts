import { expect, test, type Page } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';
import { enterAdmin } from './support/admin';
import { authenticate } from './support/auth';

const main = (page: Page) => page.getByRole('main');
const tab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('tab', { name, exact: true });

test.describe('profile', () => {
  // /profile and its tabs can be the first hit of their route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('overview: identity, active context, membership, and sign-in time', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterAdmin(page, '/profile', { heading: 'My profile' });

    await expect(
      main(page).getByText('Backend Jane Manager · backend.jane@greenfield.example'),
    ).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');

    const identity = main(page).getByRole('region', { name: 'Identity' });
    await expect(identity.getByText('55555555')).toHaveAttribute('title', IDS.jane);
    // The E2E session was created at 2026-07-26T00:00Z; Greenfield is Africa/Nairobi (UTC+3).
    await expect(identity.getByText('26 Jul 2026 · 03:00 (Africa/Nairobi)')).toBeVisible();

    const active = main(page).getByRole('region', { name: 'Active context' });
    await expect(active.getByText('Greenfield SACCO')).toBeVisible();
    await expect(active.getByText('greenfield', { exact: true })).toBeVisible();
    await expect(active.getByText('Head Office')).toBeVisible();
  });
});
