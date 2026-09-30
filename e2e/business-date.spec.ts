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

  // Layer-07 visual-pass finding: at common back-office widths the chip's plain-string label
  // ellipsized the status word first, leaving colour as the only signal (WCAG 1.4.1). The status
  // must stay fully rendered (not clipped by the label's overflow:hidden ellipsis) at every width
  // where the chip itself is shown (it hides below the `lg` breakpoint, 1200px).
  for (const width of [1200, 1280]) {
    test(`app-bar chip keeps its status word fully visible at ${width}px`, async ({
      context,
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await authenticate(context, testInfo);
      await enter(page);

      const chip = page
        .getByRole('banner')
        .getByRole('link', { name: 'Mon, 7 Sep 2026 · Business date · Open' });
      await expect(chip).toBeVisible();
      const status = chip.getByText('Open', { exact: true });
      await expect(status).toBeVisible();

      const chipBox = await chip.boundingBox();
      const statusBox = await status.boundingBox();
      if (!chipBox || !statusBox) {
        throw new Error('expected bounding boxes for the chip and its status span');
      }
      expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width + 1);
    });
  }

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
    // I3: the trigger button that opened the dialog just unmounted with the whole action set;
    // focus must land on the next available action, never <body>.
    await expect(
      hero(page).getByRole('button', { name: 'Complete close of business', exact: true }),
    ).toBeFocused();

    await run(page, 'Complete close of business');
    await expect(hero(page).getByText('Closed', { exact: true })).toBeVisible();
    await expect(hero(page).getByRole('button', { name: 'Reopen', exact: true })).toBeFocused();

    await run(page, 'Reopen');
    await expect(hero(page).getByText('Open', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(8);
    await expect(
      hero(page).getByRole('button', { name: 'Start close of business', exact: true }),
    ).toBeFocused();
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
    await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill('End of day');
    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Another business date change is in progress',
    );
    // D2: React 19's <form action> auto-resets every uncontrolled field on every submit outcome
    // (requestFormReset) — the retry below must reuse this typed reason, not a blank one.
    await expect(dialog.getByRole('textbox', { name: 'Reason (optional)' })).toHaveValue(
      'End of day',
    );

    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    await expect(historyRows(page)).toHaveCount(6);
    await expect(historyRows(page).nth(1)).toContainText('End of day');
  });

  // M16 / I1: a genuine dropped connection, distinct from the fake API's simulated 409 lock above
  // — the backend commits for real on the first attempt, but the browser never sees the response.
  test('recovers from a dropped connection after the backend already committed, without duplicating the change', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    // Lets the real POST reach the fake API (so it commits for real), then aborts the browser's
    // own connection to it. Only the first Server Action POST (identified by its Next-Action
    // header); the retry and every RSC-refresh GET to the same URL go through untouched.
    let intercepted = false;
    await page.route('**/admin/business-date*', async (route) => {
      const request = route.request();
      if (!intercepted && request.method() === 'POST' && request.headers()['next-action']) {
        intercepted = true;
        await route.fetch();
        await route.abort();
        return;
      }
      await route.continue();
    });

    await hero(page).getByRole('button', { name: 'Start close of business', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill('End of day');
    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();

    await expect(dialog.getByRole('alert')).toContainText("couldn't confirm this change");
    await expect(dialog.getByRole('textbox', { name: 'Reason (optional)' })).toHaveValue(
      'End of day',
    );

    await dialog.getByRole('button', { name: 'Start close of business', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(hero(page).getByText('Closing', { exact: true })).toBeVisible();
    // The retry's identical idempotency key must replay the already-committed change, not repeat
    // it: exactly one new row (header + 4 seeded + 1), not two.
    await expect(historyRows(page)).toHaveCount(6);
    await expect(historyRows(page).nth(1)).toContainText('End of day');
  });

  test('hides actions without the mutation permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-read-only');
    await enter(page);

    await expect(hero(page).getByText('Monday, 7 September 2026')).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
  });

  test('hydrates the app-bar chip without a mismatch', async ({ context, page }, testInfo) => {
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

    // Deterministic server-HTML check (belt-and-braces alongside the console/pageerror
    // listeners above): page.request shares this context's cookies, and before the fix the
    // Flight payload carries only a client-module reference for the icon, so this needle
    // appears in the raw response only when SSR actually rendered it. Scoped to a window around
    // the chip's own (unique) accessible name, not a `<header>`…`</header>` tag slice: the
    // indicator is inside a `<Suspense fallback={null}>` (app/(authenticated)/layout.tsx), so its
    // real markup streams in out-of-band, later in the same response, not between those tags —
    // and the hero and the rail link also render an EventOutlinedIcon, so an unscoped needle would
    // still pass even if the chip's own icon lost SSR.
    const pageHtml = await (await page.request.get('/admin/business-date')).text();
    const chipTextIndex = pageHtml.indexOf('Mon, 7 Sep 2026 · Business date · Open');
    expect(chipTextIndex).toBeGreaterThan(-1);
    const chipHtml = pageHtml.slice(Math.max(0, chipTextIndex - 500), chipTextIndex + 500);
    expect(chipHtml).toContain('data-testid="EventOutlinedIcon"');

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
