import { test, expect } from '@playwright/test';
import { addCookie, authenticate, SESSION_COOKIE_NAME } from './support/auth';

test.describe('Protected routes without a session', () => {
  test('redirects /admin to /login with reason=session_expired', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });

  test('redirects a nested admin route to /login', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });

  test('redirects /profile to /login', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });

  test('renders /login even when an unvalidated stale cookie is present', async ({
    context,
    page,
  }, testInfo) => {
    await addCookie(context, testInfo, SESSION_COOKIE_NAME, 'stale-or-revoked-cookie');

    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('Protected routes with a mocked authenticated session', () => {
  test('stops /admin at shell-free context selection until context is chosen', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/select-context\?next=%2Fadmin$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });
});
