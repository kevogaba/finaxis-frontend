import { test, expect } from '@playwright/test';
import { authenticate, sameOriginRequest, selectMuiOption } from './support/auth';

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

test.describe('Platform administration workspace', () => {
  test('preserves the requested destination through context selection and renders the live tenant directory and tenant detail', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    await page.goto('/platform-admin/tenants');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fplatform-admin%2Ftenants$/);

    // The platform operator has a single branch, so the backend auto-selects it. Await the
    // selection response itself, then the page it redirects to.
    const organisationResponse = page.waitForResponse((response) =>
      sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
    );
    await selectMuiOption(page, 'Organisation', /Platform/);
    expect((await organisationResponse).status()).toBe(200);

    await expect(page).toHaveURL(/\/platform-admin\/tenants$/);
    await expect(page.getByRole('heading', { level: 1, name: 'SACCO institutions' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${PLATFORM_TENANT_ID}`,
    );
    await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();

    await page.getByRole('link', { name: 'Acme SACCO' }).click();
    await expect(page).toHaveURL(new RegExp(`/platform-admin/tenants/${PLATFORM_TENANT_ID}$`));
    await expect(page.getByRole('heading', { name: 'Acme SACCO' }).first()).toBeVisible();
    await expect(page.getByText('COMPLETED')).toBeVisible();
  });

  test('keeps tenant contexts out of the platform workspace', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/platform-admin');

    const organisationResponse = page.waitForResponse((response) =>
      sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
    );
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    expect((await organisationResponse).status()).toBe(200);

    const branchResponse = page.waitForResponse((response) =>
      sameOriginRequest(testInfo, '/api/context/branch', 'POST')(response.request()),
    );
    await selectMuiOption(page, 'Branch', /Head Office/);
    expect((await branchResponse).status()).toBe(200);

    await expect(page).toHaveURL(/\/admin$/);
  });
});
