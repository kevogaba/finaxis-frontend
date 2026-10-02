import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Login page', () => {
  test('redirects from the root route to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('displays Finaxis branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'About Finaxis' }).getByText('Finaxis'),
    ).toBeVisible();
  });

  test('shows the Continue to Finaxis action and no password field', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue to Finaxis' })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  test('shows a generic message for a failed-authentication redirect', async ({ page }) => {
    await page.goto('/login?error=authentication_failed');
    await expect(page.getByRole('status')).toContainText(/couldn't sign you in/i);
  });

  test('shows a generic message for an expired-session redirect', async ({ page }) => {
    await page.goto('/login?reason=session_expired');
    await expect(page.getByRole('status')).toContainText(/session has expired/i);
  });

  test('shows a generic message after logging out', async ({ page }) => {
    await page.goto('/login?reason=logged_out');
    await expect(page.getByRole('status')).toContainText(/signed out/i);
  });

  test('renders the page title at the h1 type size', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1, name: 'Welcome back' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(heading).toHaveCSS('font-size', '28px');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(heading).toHaveCSS('font-size', '25px');
  });

  test('works at mobile viewport widths without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('works at desktop viewport widths and shows the brand panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'About Finaxis' })).toBeVisible();
  });

  test('renders light and dark color schemes', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Light mode' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);

    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  const colorSchemes = ['light', 'dark'] as const;
  const viewports = [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ];

  for (const colorScheme of colorSchemes) {
    for (const viewport of viewports) {
      test(`has no serious or critical accessibility violations (${colorScheme}, ${viewport.width}px)`, async ({
        page,
      }) => {
        // Set both before navigating: InitColorSchemeScript reads `matchMedia` on load, so a
        // scheme set after `goto` would scan whatever scheme the page happened to boot into.
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await page.goto('/login');

        // Confirm the emulated scheme actually took before trusting the scan below — otherwise
        // a "dark" run that silently rendered light would report a false pass.
        await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme));

        const results = await new AxeBuilder({ page }).analyze();
        const seriousOrCritical = results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        );

        expect(seriousOrCritical).toEqual([]);
      });
    }
  }
});
