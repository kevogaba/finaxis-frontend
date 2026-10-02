import { test, expect } from '@playwright/test';
import {
  addCookie,
  authenticate,
  CONTEXT_COOKIE_NAME,
  sameOriginRequest,
  selectMuiOption,
} from './support/auth';

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';

test.describe('Authenticated context selection', () => {
  test('stops authenticated profile access at shell-free /select-context', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);

    await page.goto('/profile');

    await expect(page).toHaveURL(/\/select-context\?next=%2Fprofile$/);
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
    await expect(page).toHaveURL(/\/select-context\?next=%2Fprofile$/);

    const organisationRequest = page.waitForRequest(
      sameOriginRequest(testInfo, '/api/context/organisation', 'POST'),
    );
    const organisationResponse = page.waitForResponse((response) =>
      sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
    );
    const branchResponse = page.waitForResponse((response) =>
      sameOriginRequest(testInfo, '/api/context/branches', 'GET')(response.request()),
    );
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    const organisationPost = await organisationRequest;
    expect(organisationPost.postDataJSON()).toEqual({ organisation_id: ORGANISATION_ID });

    expect((await organisationResponse).status()).toBe(200);
    expect((await branchResponse).status()).toBe(200);
    await expect(page.getByRole('combobox', { name: 'Branch' })).toBeVisible({ timeout: 15000 });

    const branchRequest = page.waitForRequest(
      sameOriginRequest(testInfo, '/api/context/branch', 'POST'),
    );
    await selectMuiOption(page, 'Branch', /Head Office/);
    const branchPost = await branchRequest;
    expect(branchPost.postDataJSON()).toEqual({ branch_id: BRANCH_ID });

    await expect(page).toHaveURL(/\/profile$/);
    const banner = page.getByRole('banner');
    await expect(banner.getByText('Administration')).toBeVisible();
    await expect(banner.getByText('Greenfield SACCO')).toBeVisible();
    await expect(banner.getByText('Head Office')).toBeVisible();
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backend Jane Manager' })).toBeVisible();
    // Scoped to `main`: the account trigger in the banner also shows the user's email now.
    await expect(main.getByText('backend.jane@greenfield.example')).toBeVisible();
    await expect(main.getByText('user.view')).toBeVisible();
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

    // The 403 response can be slow under a cold `next dev` compile of the route handler, so wait
    // for it explicitly rather than trusting the alert to render inside the default assertion
    // timeout (see the equivalent wait in the success-path test above).
    const organisationResponse = page.waitForResponse(
      (response) =>
        sameOriginRequest(testInfo, '/api/context/organisation', 'POST')(response.request()),
      { timeout: 20000 },
    );
    await selectMuiOption(page, 'Organisation', /Greenfield SACCO/);
    expect((await organisationResponse).status()).toBe(403);

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

    await expect(page).toHaveURL(/\/select-context\?next=%2Fprofile$/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByText('Backend Jane Manager')).toHaveCount(0);
  });
});
