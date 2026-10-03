import { test, expect } from '@playwright/test';
import { authenticate, sameOriginRequest, selectMuiOption } from './support/auth';

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

test.describe('Platform administration workspace', () => {
  // Every route this file touches (/platform-admin, /platform-admin/tenants,
  // /platform-admin/tenants/[tenantId]) is unique to it, so unlike the other specs it gets no
  // warm-compile head start from anything else in the suite; each per-step wait below already has
  // an explicit timeout for that, but their sum can still approach the default 30s test timeout
  // under heavy Playwright worker contention on a cold `next dev` server.
  test.describe.configure({ timeout: 60000 });

  test('preserves the requested destination through context selection and renders the live tenant directory and tenant detail', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    // The very first hit of this route tree: the layout+page module graph (and its imports —
    // TenantDirectoryTable, the tenant service, …) can still be compiling, so this redirect can
    // be slower than the default 5s assertion timeout under cold `next dev` worker contention.
    await page.goto('/platform-admin/tenants');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fplatform-admin%2Ftenants$/, {
      timeout: 20000,
    });

    // The platform operator has a single branch, so the backend auto-selects it. Await the
    // selection response instead of the resulting URL directly — the route handler and the
    // redirect target can both be compiling for the first time under a cold `next dev` server.
    const organisationResponse = page.waitForResponse(
      (response) =>
        sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
      { timeout: 20000 },
    );
    await selectMuiOption(page, 'Organisation', /Platform/);
    expect((await organisationResponse).status()).toBe(200);

    await expect(page).toHaveURL(/\/platform-admin\/tenants$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: 'SACCO institutions' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${PLATFORM_TENANT_ID}`,
    );
    await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();

    await page.getByRole('link', { name: 'Acme SACCO' }).click();
    await expect(page).toHaveURL(new RegExp(`/platform-admin/tenants/${PLATFORM_TENANT_ID}$`), {
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Acme SACCO' }).first()).toBeVisible();
    await expect(page.getByText('COMPLETED')).toBeVisible();
  });

  test('keeps tenant contexts out of the platform workspace', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/platform-admin');

    const organisationResponse = page.waitForResponse(
      (response) =>
        sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
      { timeout: 20000 },
    );
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    expect((await organisationResponse).status()).toBe(200);

    const branchResponse = page.waitForResponse(
      (response) => sameOriginRequest(testInfo, '/api/context/branch', 'POST')(response.request()),
      { timeout: 20000 },
    );
    await selectMuiOption(page, 'Branch', /Head Office/);
    expect((await branchResponse).status()).toBe(200);

    await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
  });
});
