import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

async function enterGreenfield(page: Page) {
  await page.goto('/admin');
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
  await expect(page).toHaveURL(/\/admin$/);
}

// The platform operator has a single branch, so selecting the organisation auto-selects it and
// redirects straight back to the requested page (see e2e/platform-administration.spec.ts).
async function enterPlatformAdmin(page: Page) {
  await page.goto('/platform-admin');
  await selectMuiOption(page, 'Organisation', /Platform/);
  // Slower default timeout: this route tree gets no warm-compile head start from an earlier test
  // when the a11y matrix below hits it first (see e2e/platform-administration.spec.ts).
  await expect(page).toHaveURL(/\/platform-admin$/, { timeout: 15000 });
}

test.describe('application shell', () => {
  // /platform-admin can be the first hit of its route tree under a cold `next dev` compile (see
  // e2e/platform-administration.spec.ts), which the a11y matrix below multiplies by 4 targets.
  test.describe.configure({ timeout: 60000 });

  test('shows the rail, workspace, context, account, and footer', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterGreenfield(page);

    const rail = page.getByRole('navigation', { name: 'Administration' });
    await expect(rail.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const banner = page.getByRole('banner');
    await expect(banner.getByText('Greenfield SACCO')).toBeVisible();
    await expect(banner.getByText('Head Office')).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Backend Jane Manager' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Finaxis');
  });

  test('remembers a collapsed rail across reloads', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enterGreenfield(page);

    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  });

  test('uses a temporary drawer on mobile with no horizontal scroll, even with long names', async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticate(context, testInfo, 'long-names');
    await enterGreenfield(page);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Overview' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  // Layer a11y gate (controller ruling): both modules, both color schemes, desktop + 375px.
  const AXE_TARGETS = [
    { label: 'admin', scenario: 'default', enter: enterGreenfield },
    { label: 'platform-admin', scenario: 'platform-operator', enter: enterPlatformAdmin },
  ] as const;
  const VIEWPORTS = [
    { label: 'desktop', width: 1280, height: 800 },
    { label: '375px', width: 375, height: 812 },
  ] as const;

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of VIEWPORTS) {
      for (const target of AXE_TARGETS) {
        test(`has no serious or critical accessibility violations (${target.label}, ${colorScheme}, ${viewport.label})`, async ({
          context,
          page,
        }, testInfo) => {
          // Set scheme and viewport before navigating: InitColorSchemeScript reads `matchMedia` on
          // load, so a scheme set after `goto` would scan whatever scheme the page happened to boot
          // into (see e2e/login.spec.ts).
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize(viewport);
          await authenticate(context, testInfo, target.scenario);
          await target.enter(page);

          // Confirm the emulated scheme actually took before trusting the scan below — otherwise a
          // "dark" run that silently rendered light would report a false pass.
          await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme));

          const results = await new AxeBuilder({ page }).analyze();
          expect(
            results.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);
        });
      }
    }
  }
});
