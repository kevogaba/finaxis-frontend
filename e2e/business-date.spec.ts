import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

/** Bounded URL/heading waits, like audit.spec's `enter()`: the first hit of a route tree under a
 * cold `next dev` compile can update the URL before the RSC payload (and its `h1`) has rendered. */
async function enter(page: Page) {
  await page.goto('/admin/business-date');
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
  await expect(page).toHaveURL(/\/admin\/business-date/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Business date' })).toBeVisible({
    timeout: 15000,
  });
}

const hero = (page: Page) => page.getByRole('region', { name: 'Current business date' });
const historyRows = (page: Page) =>
  page.getByRole('table', { name: 'Business date history' }).getByRole('row');

async function run(page: Page, action: string, reason?: string) {
  await hero(page).getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill(reason);
  await dialog.getByRole('button', { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('business date', () => {
  // /admin/business-date can be the first hit of its route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('shows the date, status, history, and the app-bar indicator', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    // Positive control for the read-only gating test below: the rail link is scoped to the
    // Administration nav landmark, since an unscoped match would also hit the app-bar chip (its
    // accessible name is "Mon, 7 Sep 2026 · Business date · Open", a substring match on "Business
    // date").
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Business date', exact: true }),
    ).toBeVisible();

    await expect(hero(page).getByText('Monday, 7 September 2026')).toBeVisible();
    await expect(hero(page).getByText('Open', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(5); // header + 4
    await expect(
      page
        .getByRole('banner')
        .getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' }),
    ).toBeVisible();
  });

  test('runs close of business and reopens, each with a fresh request', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await run(page, 'Start close of business', 'End of day');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Close of business started' }),
    ).toBeVisible();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    await expect(historyRows(page).nth(1)).toContainText('Close of business started');
    await expect(historyRows(page).nth(1)).toContainText('End of day');

    await run(page, 'Complete close of business');
    await expect(hero(page).getByText('Closed', { exact: true })).toBeVisible();
    await run(page, 'Reopen');
    await expect(hero(page).getByText('Open', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(8);
  });

  test('advances to a later date and updates the app bar', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await hero(page).getByRole('button', { name: 'Advance date', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Advance the business date' });
    await expect(dialog.getByLabel('New business date')).toHaveAttribute('min', '2026-09-08');
    await dialog.getByLabel('New business date').fill('2026-09-08');
    await dialog.getByRole('button', { name: 'Advance date', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(hero(page).getByText('Tuesday, 8 September 2026')).toBeVisible();
    await expect(
      page.getByRole('banner').getByRole('link', { name: /Tue, 8 Sep 2026/ }),
    ).toBeVisible();
  });

  test('retries a busy lock with the same request and records one change', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-busy');
    await enter(page);

    await hero(page).getByRole('button', { name: 'Start close of business', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Another business date change is in progress',
    );

    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(6);
  });

  test('hides actions without the mutation permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-read-only');
    await enter(page);

    await expect(hero(page).getByText('Monday, 7 September 2026')).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
  });

  test('hydrates the app-bar chip and the profile chips without a mismatch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      if (/hydrat/i.test(error.message)) hydrationErrors.push(error.message);
    });

    // A full document load, unlike the client navigation enter() ends on, is what hydrates
    // server-rendered HTML — a client-side navigation never re-hydrates anything.
    await page.reload();

    await expect(
      page
        .getByRole('banner')
        .getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' }),
    ).toBeVisible();

    // Prove hydration actually ran (not just that the server HTML rendered).
    await hero(page).getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Technical details' }).click();
    await expect(page.getByText(/User ID:/)).toBeVisible();

    expect(hydrationErrors).toEqual([]);
  });

  // Layer a11y gate: light and dark, both at desktop and 375px, like audit.spec's own matrix
  // (e2e/audit.spec.ts:329-387). Each case scans the page, opens the dialog, and scans again.
  test.describe('business date accessibility', () => {
    test.describe.configure({ timeout: 90000 });

    const AXE_VIEWPORTS = [
      { label: 'desktop', width: 1280, height: 800, scenario: 'default' as const },
      { label: '375px', width: 375, height: 812, scenario: 'long-names' as const },
    ];

    for (const colorScheme of ['light', 'dark'] as const) {
      for (const viewport of AXE_VIEWPORTS) {
        test(`has no serious or critical accessibility violations (${colorScheme}, ${viewport.label})`, async ({
          context,
          page,
        }, testInfo) => {
          // Set scheme and viewport before navigating: InitColorSchemeScript reads matchMedia on
          // load, so a scheme set after goto would scan whatever scheme the page booted into.
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize(viewport);
          await authenticate(context, testInfo, viewport.scenario);
          await enter(page);

          await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme));
          await expect(page).toHaveTitle(/.+/);

          if (viewport.label === '375px') {
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
              ),
            ).toBe(false);
          }

          const pageResults = await new AxeBuilder({ page }).analyze();
          expect(
            pageResults.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);

          await hero(page)
            .getByRole('button', { name: 'Start close of business', exact: true })
            .click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          // MUI's Fade sets `opacity` directly on the dialog's transition container (not the
          // dialog paper); axe blends ancestor opacity into color-contrast, so scanning mid-fade
          // can intermittently report a false contrast violation on the submit button (same
          // mechanism as context.spec.ts's context-overlays matrix).
          await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');

          const dialogResults = await new AxeBuilder({ page }).analyze();
          expect(
            dialogResults.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);
        });
      }
    }
  });
});
