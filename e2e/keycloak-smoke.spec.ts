import { test, expect } from '@playwright/test';

const KEYCLOAK_USERNAME = process.env.FINAXIS_LOCAL_USERNAME ?? 'local.admin';
const KEYCLOAK_PASSWORD = process.env.FINAXIS_LOCAL_PASSWORD ?? 'local-admin';

test.describe('Real Keycloak authentication (requires the platform docker compose stack)', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request
      .get('http://localhost:8080/realms/finaxis/.well-known/openid-configuration')
      .catch(() => null);
    test.skip(
      !response?.ok(),
      'Local Keycloak is not reachable on :8080 — start it with `docker compose up -d keycloak postgres` in the platform repo before running this smoke test.',
    );
  });

  test('completes the full login → shell → logout round trip', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue to Finaxis' }).click();

    await page.waitForURL(/realms\/finaxis\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username or email/i).fill(KEYCLOAK_USERNAME);
    await page.getByLabel('Password', { exact: true }).fill(KEYCLOAK_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('Administration')).toBeVisible();
    await expect(page.getByText(/greenfield sacco/i)).toBeVisible();

    await page.getByRole('button', { name: /switch application/i }).click();
    await expect(page.getByRole('menuitem', { name: /administration/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);

    await page.goto('/profile');
    await expect(page.getByText('No branches assigned')).toBeVisible();
    await expect(page.getByText('No application roles assigned')).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('button', { name: /local admin/i }).click();
    const logoutButton = page.getByRole('button', { name: /log out/i });
    await Promise.all([
      page.waitForURL(/realms\/finaxis\/protocol\/openid-connect\/logout/),
      logoutButton.click(),
    ]);

    // app/api/auth/logout builds Keycloak's RP-initiated logout URL without
    // an id_token_hint (documented limitation — see
    // docs/authentication/security.md "Known limitation: no id_token_hint on
    // logout"), so Keycloak shows a "Do you want to log out?" confirmation
    // page instead of logging out silently. The real user must click through
    // it.
    // Note: the confirmation redirects back to whatever
    // AUTH_POST_LOGOUT_REDIRECT_URI is configured to (see .env.local) — this
    // environment points it at plain `/login`, with no `?reason=` query
    // string appended anywhere in the actual logout route. Assert against
    // that real behavior rather than the `reason=logged_out` UI copy variant,
    // which only exists for the (currently unused) direct-navigation case
    // covered by e2e/login.spec.ts.
    await Promise.all([
      page.waitForURL(/\/login$/),
      page.getByRole('button', { name: 'Logout' }).click(),
    ]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/);
  });
});
