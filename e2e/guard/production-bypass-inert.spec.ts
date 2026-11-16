import { expect, test } from '@playwright/test';
import { authenticate } from '../support/auth';

// Each workspace's entry point, opened with the e2e bypass's session cookie. In the normal
// production build the bypass is compiled out, so that cookie names no session and each page sends
// the browser straight to sign-in. Checked in the browser, not by status code: behind the root
// loading boundary a layout's redirect() can answer 200 and redirect on the client.
//
// Landing on /login is not enough on its own: a live bypass is sent to context selection first
// (the session has no context yet), and a backend answering 401 there ends on /login too. So the
// walk must never pass through /select-context.
for (const path of ['/profile', '/admin', '/platform-admin']) {
  test(`the production build ignores the e2e session bypass at ${path}`, async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });

    await page.goto(path);

    await expect(page).toHaveURL((url) => url.pathname === '/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(visited, 'the bypass session reached context selection').not.toContain(
      '/select-context',
    );
  });
}
