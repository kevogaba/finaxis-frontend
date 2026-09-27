import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function requireBox(box: BoundingBox | null): BoundingBox {
  if (!box) {
    throw new Error('expected a bounding box');
  }
  return box;
}

/**
 * Bounded URL/heading waits, like shell.spec's `enterGreenfield`: `/admin/audit` can be the first
 * hit of its route tree under a cold `next dev` compile, and the URL updates before the RSC
 * payload (and its `h1`) has actually rendered.
 */
async function enter(page: Page, path: '/admin/audit' | '/admin' = '/admin/audit') {
  await page.goto(path);
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
  const isAudit = path === '/admin/audit';
  await expect(page).toHaveURL(isAudit ? /\/admin\/audit/ : /\/admin$/, { timeout: 15000 });
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: isAudit ? 'Audit trail' : 'Administration Overview',
    }),
  ).toBeVisible({ timeout: 15000 });
}

test.describe('audit trail', () => {
  // /admin/audit can be the first hit of its route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('lists events, filters through the URL, and paginates', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await expect(page.getByText('30 events')).toBeVisible();
    const table = page.getByRole('table', { name: 'Audit events' });
    await expect(table.getByRole('row')).toHaveCount(21); // header + 20

    // Proves Task 5 renders the branch/tenant lookups end to end against the fake `/branches`
    // and `/tenant` routes — scoped to the table because the header context chip also shows
    // 'Head Office'.
    await expect(
      table.getByRole('columnheader', { name: 'Date & time (Africa/Nairobi)' }),
    ).toBeVisible();
    await expect(table.getByText('Head Office').first()).toBeVisible();
    // Seed index 0 is 2026-09-07T07:59:00Z; 10:59 proves the organisation timezone
    // (Africa/Nairobi, UTC+3) is used, not a UTC fallback.
    await expect(table.getByRole('row').nth(1)).toContainText('10:59');

    await selectMuiOption(page, 'Entity type', /^Branch$/);
    await expect(page).toHaveURL(/entityType=BRANCH/);
    await expect(page.getByText('6 events')).toBeVisible();

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('30 events')).toBeVisible();

    // Race check (carried from Task 2's cv-M6 fix): fill From with a value earlier than every
    // seed (all seeds are 2026-09-07T07:30-07:59Z; midnight keeps every one of them in both UTC
    // and EAT, so this doesn't depend on Playwright's host timezone), then click Next immediately
    // without waiting for the From field's own navigation — the mousedown blur and the button's
    // click both push a URL, and useListNavigation must build the second on the first's pending
    // query instead of discarding it.
    await page.getByLabel('From', { exact: true }).fill('2026-09-07T00:00');
    await page.getByRole('button', { name: /next page/i }).click();
    await expect(table.getByRole('row')).toHaveCount(11);
    // One predicate on the settled URL, not two separate `toHaveURL` polls: a transient
    // `?occurredFrom=…` followed by a stale `?page=1` would satisfy two polls one after another
    // without proving the final URL carries both params together.
    await expect(page).toHaveURL(
      (url) => url.searchParams.has('occurredFrom') && url.searchParams.get('page') === '1',
    );
  });

  test('opens an event with its before/after state and closes it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await page
      .getByRole('link', { name: /view event/i })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: /invited user/i });
    // Bounded: the first drawer open in this file, possibly the first hit of the drawer's client
    // bundle under a cold `next dev` compile.
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer.getByText(/"status": "DRAFT"/)).toBeVisible();
    await expect(drawer.getByText('New teller joining the Westlands team')).toBeVisible();
    // The newest seed (index 0) is user.invite, SUCCESS/INFO. exact: true is required — Playwright's
    // default string match ignores case, and raw 'SUCCESS'/'INFO' would otherwise pass too.
    await expect(drawer.getByText('Success', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Info', { exact: true })).toBeVisible();
    // Closes the Task 5 deferred minor: the drawer's time line carries the zone label.
    await expect(drawer.getByText(/\(Africa\/Nairobi\)/)).toBeVisible();

    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(page).not.toHaveURL(/event=/);

    // Keyboard path: Escape goes through the same close() -> router.push(closeHref, { scroll:
    // false }) path as Close, and focus must return to the link that opened the drawer.
    const link = page.getByRole('link', { name: /view event/i }).first();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /invited user/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/event=/);
    await expect(link).toBeFocused();
  });

  test('filters by actor from a row', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await page
      .getByRole('table', { name: 'Audit events' })
      .getByRole('link', { name: 'Backend Jane Manager' })
      .first()
      .click();
    await expect(page).toHaveURL(/actorId=/);
    await expect(page.getByText('Actor: Backend Jane Manager')).toBeVisible();
    await expect(page.getByText('25 events')).toBeVisible();
  });

  test('hides the audit trail without audit.view', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'no-audit-permission');
    await enter(page, '/admin');

    await expect(page.getByRole('link', { name: 'Audit trail' })).toHaveCount(0);

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit trail' })).toBeVisible({
      timeout: 15000,
    });
    // Filtered: Next's route announcer is also an alert.
    await expect(page.getByRole('alert').filter({ hasText: 'Access denied' })).toBeVisible();
  });

  test('meets the density targets: header cell, small inputs, and pagination buttons', async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await authenticate(context, testInfo);
    await enter(page);

    const headerBox = requireBox(await page.getByRole('columnheader').first().boundingBox());
    const entityTypeBox = requireBox(
      await page.getByRole('combobox', { name: 'Entity type' }).locator('..').boundingBox(),
    );
    const fromBox = requireBox(
      await page.getByLabel('From', { exact: true }).locator('..').boundingBox(),
    );
    const nextButtonBox = requireBox(
      await page.getByRole('button', { name: 'Go to next page' }).boundingBox(),
    );

    expect(Math.abs(headerBox.height - 39)).toBeLessThanOrEqual(1);
    expect(Math.abs(entityTypeBox.height - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(fromBox.height - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextButtonBox.width - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextButtonBox.height - 32)).toBeLessThanOrEqual(1);

    // Every audit row is two-line, so this can't stand in for the single-line 44px target below.
    // Report it, don't assert it.
    const firstBodyRow = page.getByRole('table', { name: 'Audit events' }).getByRole('row').nth(1);
    const rowBox = await firstBodyRow.boundingBox();
    testInfo.annotations.push({
      type: 'density-two-line-row-height',
      description: rowBox
        ? `${String(rowBox.height)}px (two-line row; not asserted)`
        : 'unmeasured',
    });

    // No audit row is single-line, so clone a real body row (same MUI classes, same theme CSS)
    // with one short token per cell and measure the clone against the 44px single-line target.
    const singleLineHeight = await firstBodyRow.evaluate((row) => {
      if (!(row instanceof HTMLTableRowElement)) {
        throw new Error('expected a table row element');
      }
      const clone = row.cloneNode(true) as HTMLTableRowElement;
      for (const cell of Array.from(clone.cells)) cell.textContent = '—';
      row.parentElement?.append(clone);
      return clone.getBoundingClientRect().height;
    });
    expect(Math.abs(singleLineHeight - 44)).toBeLessThanOrEqual(1);
  });

  // Layer a11y gate: light and dark, both at desktop and 375px. Each case authenticates, enters,
  // scans the list, opens the drawer, and scans again — more sequential work than the file's other
  // tests. Under full-suite worker contention this can exceed the outer describe's 60s budget, like
  // context.spec's own axe matrix (e2e/context.spec.ts:209-214).
  test.describe('audit accessibility', () => {
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
          // Set scheme and viewport before navigating, like shell.spec: InitColorSchemeScript reads
          // matchMedia on load, so a scheme set after goto would scan whatever scheme the page
          // happened to boot into.
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

          const listResults = await new AxeBuilder({ page }).analyze();
          expect(
            listResults.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);

          await page
            .getByRole('link', { name: /view event/i })
            .first()
            .click();
          const drawer = page.getByRole('dialog', { name: /invited user/i });
          // Bounded: the first drawer open in this worker may still be compiling its client
          // bundle, like the drawer test's own first open at :98.
          await expect(drawer).toBeInViewport({ timeout: 15000 });

          const drawerResults = await new AxeBuilder({ page }).analyze();
          expect(
            drawerResults.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);
        });
      }
    }
  });
});
