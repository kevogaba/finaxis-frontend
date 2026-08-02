import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const SESSION_COOKIE_NAME = 'finaxis.session_token';
const SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
const CONTEXT_COOKIE_NAME = 'finaxis_context';
const SCENARIO_COOKIE_NAME = 'finaxis_e2e_scenario';
const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';

function baseUrl(testInfo: TestInfo): string {
  const configuredBaseUrl = testInfo.project.use.baseURL;
  if (typeof configuredBaseUrl !== 'string') {
    throw new Error('Playwright baseURL must be configured for e2e auth fixtures.');
  }

  return configuredBaseUrl;
}

async function addCookie(context: BrowserContext, testInfo: TestInfo, name: string, value: string) {
  await context.addCookies([
    {
      httpOnly: true,
      name,
      sameSite: 'Lax',
      secure: false,
      url: baseUrl(testInfo),
      value,
    },
  ]);
}

async function authenticate(
  context: BrowserContext,
  testInfo: TestInfo,
  scenario?: 'empty-organisations' | 'selection-forbidden',
) {
  await addCookie(context, testInfo, SESSION_COOKIE_NAME, SESSION_COOKIE_VALUE);
  if (scenario) {
    await addCookie(context, testInfo, SCENARIO_COOKIE_NAME, scenario);
  }
}

async function selectMuiOption(page: Page, label: string, option: RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

function sameOriginRequest(testInfo: TestInfo, pathname: string, method: string) {
  const expectedOrigin = new URL(baseUrl(testInfo)).origin;

  return (request: { method(): string; url(): string }) => {
    const url = new URL(request.url());
    return (
      url.origin === expectedOrigin && url.pathname === pathname && request.method() === method
    );
  };
}

test.describe('Authenticated context selection', () => {
  test('stops authenticated profile access at shell-free /select-context', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto('/profile');

    await expect(page).toHaveURL(/\/select-context$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  });

  test('selects organisation and branch through same-origin route boundaries before rendering profile', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/select-context$/);

    const organisationRequest = page.waitForRequest(
      sameOriginRequest(testInfo, '/api/context/organisation', 'POST'),
    );
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    const organisationPost = await organisationRequest;
    expect(organisationPost.postDataJSON()).toEqual({ organisation_id: ORGANISATION_ID });

    await expect(page.getByRole('combobox', { name: 'Branch' })).toBeVisible();

    const branchRequest = page.waitForRequest(
      sameOriginRequest(testInfo, '/api/context/branch', 'POST'),
    );
    await selectMuiOption(page, 'Branch', /Head Office/);
    const branchPost = await branchRequest;
    expect(branchPost.postDataJSON()).toEqual({ branch_id: BRANCH_ID });

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('banner').getByText('Administration')).toBeVisible();
    await expect(page.getByText('Greenfield SACCO · Head Office')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('Backend Jane Manager')).toBeVisible();
    await expect(page.getByText('backend.jane@greenfield.example')).toBeVisible();
    await expect(page.getByText('users.read')).toBeVisible();
  });

  test('shows an actionable empty state when no organisations are available', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'empty-organisations');

    await page.goto('/select-context');

    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByText(/No organisations are available for your account/i)).toBeVisible();
    await expect(page.getByText(/Contact an administrator/i)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Organisation' })).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('shows safe error text when organisation selection is forbidden', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'selection-forbidden');
    await page.goto('/select-context');

    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);

    await expect(
      page.getByRole('alert').filter({ hasText: "We couldn't update your context" }),
    ).toBeVisible();
    await expect(page.getByText(/secret|token|membership/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/select-context$/);
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('sends stale saved context through reselection instead of rendering the shell', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');

    await page.goto('/profile');

    await expect(page).toHaveURL(/\/select-context$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByText('Backend Jane Manager')).toHaveCount(0);
  });
});
