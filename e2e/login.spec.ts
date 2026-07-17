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
    // The default (desktop) viewport shows the full brand panel, not the mobile header.
    await expect(
      page.getByRole('complementary', { name: 'About Finaxis' }).getByText('Finaxis'),
    ).toBeVisible();
  });

  test('shows required-field validation errors', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/enter your email or username/i).first()).toBeVisible();
    await expect(page.getByText(/password must be at least 8 characters/i).first()).toBeVisible();
  });

  test('can show and hide the password', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.getByLabel('Password', { exact: true });

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('shows a mock-auth result on valid submission', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email or username/i }).fill('member@finaxis.test');
    await page.getByLabel('Password', { exact: true }).fill('supersecret');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/ui foundation is ready/i)).toBeVisible();
  });

  test('shows a generic error for the locked demo account', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email or username/i }).fill('locked@finaxis.test');
    await page.getByLabel('Password', { exact: true }).fill('supersecret');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/we could not sign you in/i)).toBeVisible();
  });

  test('is keyboard navigable end to end', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email or username/i }).focus();
    await page.keyboard.type('member@finaxis.test');
    await page.keyboard.press('Tab');
    await page.keyboard.type('supersecret');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/ui foundation is ready/i)).toBeVisible();
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
