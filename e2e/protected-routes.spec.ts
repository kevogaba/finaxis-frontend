import { test, expect } from '@playwright/test';

const SESSION_COOKIE_NAME = 'finaxis.session_token';
const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';

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
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== 'string') {
      throw new Error('Playwright baseURL must be configured for cookie setup.');
    }
    await context.addCookies([
      {
        httpOnly: true,
        name: SESSION_COOKIE_NAME,
        sameSite: 'Lax',
        secure: false,
        url: baseURL,
        value: 'stale-or-revoked-cookie',
      },
    ]);

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
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== 'string') {
      throw new Error('Playwright baseURL must be configured for cookie setup.');
    }
    await context.addCookies([
      {
        httpOnly: true,
        name: SESSION_COOKIE_NAME,
        sameSite: 'Lax',
        secure: false,
        url: baseURL,
        value: SESSION_COOKIE_VALUE,
      },
    ]);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/select-context\?next=%2Fadmin$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });
});
