import { test, expect } from '@playwright/test';

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
});
