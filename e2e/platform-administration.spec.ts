import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

// Requires PLATFORM_ORGANISATION_ID to equal the e2e fixture's hardcoded organisation id
// (auth/e2e-test-mode.ts), which CI sets. Locally, `.env.local` holds your real platform
// organisation id for manual testing against a live backend, so running `pnpm test:e2e`
// as-is will fail this spec — override for this file only, e.g.:
//   PLATFORM_ORGANISATION_ID=11111111-1111-4111-8111-111111111111 pnpm test:e2e e2e/platform-administration.spec.ts
const SESSION_COOKIE_NAME = 'finaxis.session_token';
const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

function baseUrl(testInfo: TestInfo): string {
  const configuredBaseUrl = testInfo.project.use.baseURL;
  if (typeof configuredBaseUrl !== 'string') {
    throw new Error('Playwright baseURL must be configured for e2e auth fixtures.');
  }

  return configuredBaseUrl;
}

async function authenticate(context: BrowserContext, testInfo: TestInfo) {
  await context.addCookies([
    {
      httpOnly: true,
      name: SESSION_COOKIE_NAME,
      sameSite: 'Lax',
      secure: false,
      url: baseUrl(testInfo),
      value: SESSION_COOKIE_VALUE,
    },
  ]);
}

async function selectMuiOption(page: Page, label: string, option: RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('Platform administration workspace', () => {
  test('preserves the requested destination through context selection and renders the live tenant directory, tenant detail, and audit event pages', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto('/platform-admin/tenants');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fplatform-admin%2Ftenants$/);

    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    await expect(page.getByRole('combobox', { name: 'Branch' })).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Branch', /Head Office/);

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
    await expect(page.getByText('COMPLETE')).toBeVisible();

    await page.getByRole('link', { name: 'Audit Events' }).click();
    await expect(page).toHaveURL(/\/platform-admin\/audit$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit events' })).toBeVisible();
    const auditTable = page.getByRole('table', { name: 'Audit event directory results' });
    await expect(auditTable).toBeVisible();
    await expect(auditTable.getByRole('cell', { name: /^TENANT /i })).toBeVisible();
  });
});
