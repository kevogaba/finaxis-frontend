import { test, expect } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

test.describe('Platform administration workspace', () => {
  test('preserves the requested destination through context selection and renders the live tenant directory and tenant detail', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    await page.goto('/platform-admin/tenants');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fplatform-admin%2Ftenants$/);

    // The platform operator has a single branch, so the backend auto-selects it.
    await selectMuiOption(page, 'Organisation', /Platform/);

    await expect(page).toHaveURL(/\/platform-admin\/tenants$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tenant directory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acme SACCO' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${PLATFORM_TENANT_ID}`,
    );
    await expect(page.getByRole('navigation', { name: 'pagination navigation' })).toBeVisible();

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
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    await selectMuiOption(page, 'Branch', /Head Office/);

    await expect(page).toHaveURL(/\/admin$/);
  });
});
