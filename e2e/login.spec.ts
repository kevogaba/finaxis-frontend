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

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).analyze();

    const seriousOrCritical = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );

    expect(seriousOrCritical).toEqual([]);
  });
});
