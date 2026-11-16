import { expect, test } from '@playwright/test';
import { authenticate } from '../support/auth';

// Each workspace's entry point, opened with the e2e bypass's session cookie. In the normal
// production build the bypass is compiled out, so that cookie names no session and each page sends
// the browser to sign-in. Checked in the browser, not by status code: behind the root loading
// boundary a layout's redirect() can answer 200 and redirect on the client.
for (const path of ['/profile', '/admin', '/platform-admin']) {
  test(`the production build ignores the e2e session bypass at ${path}`, async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto(path);

    await expect(page).toHaveURL((url) => url.pathname === '/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}
