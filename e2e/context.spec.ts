import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

const ACME_TENANT_ID = '99999999-9999-4999-8999-999999999999';

/** Reaches /select-context (bounded: first hit of the /admin route tree) and picks Greenfield. */
async function goToAdminAsGreenfield(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/select-context\?next=%2Fadmin$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible({
    timeout: 15000,
  });
  await selectMuiOption(page, 'Organisation', /Greenfield/);
}

async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.describe('working context', () => {
  // /admin and /platform-admin/tenants/[tenantId] can be the first hit of their route tree under a
  // cold `next dev` compile; the axe matrix below multiplies that by 4 targets.
  test.describe.configure({ timeout: 90000 });

  test('offers All branches to multi-branch users and shows it in the shell', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /All branches \(institution level\)/);

    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible({
      timeout: 20000,
    });
  });

  test('pins a single distinct branch even when the backend lists it twice', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'duplicate-assignments');
    await goToAdminAsGreenfield(page);

    // The backend lists Head Office twice (HOME + OPERATE); the client de-dupes to the one
    // distinct branch and auto-pins it — no branch combobox is ever shown for this user.
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible({
      timeout: 20000,
    });
  });

  test('uses institution level for members without branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-branches');
    await goToAdminAsGreenfield(page);

    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible({
      timeout: 20000,
    });
  });

  test('switches branch from the app bar dialog', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /Head Office/);
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole('button', { name: /switch organisation or branch/i }).click();
    const dialog = page.getByRole('dialog', { name: /switch working context/i });
    await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Organisation' }).click();
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: /Westlands/ }).click();

    // Assert the toast before the banner: the Snackbar auto-hides after 5s, while the banner
    // waits on router.refresh() and a cold compile of the (already-visited) /admin route.
    await expect(
      page.getByRole('alert').filter({ hasText: /Switched to Greenfield SACCO/ }),
    ).toBeVisible();
    await expect(page.getByRole('banner').getByText('Westlands Branch')).toBeVisible({
      timeout: 20000,
    });
  });

  test('moves between workspaces with the app switcher', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'multi-org');
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /Head Office/);
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole('button', { name: 'Switch application', exact: true }).click();
    await page.getByRole('button', { name: /Platform administration/ }).click();

    // The platform operator has a single branch, so switching auto-pins it — toast before the
    // banner/URL, per the same auto-hiding-Snackbar-vs-refresh ordering as above.
    await expect(page.getByRole('alert').filter({ hasText: /Switched to Platform/ })).toBeVisible();
    await expect(page).toHaveURL(/\/platform-admin$/, { timeout: 20000 });
    await expect(page.getByRole('banner').getByText('Platform', { exact: true })).toBeVisible({
      timeout: 20000,
    });
  });

  test('keeps a deep link through context selection', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    // First hit of the dynamic tenant-detail route tree — can be slower than the default
    // assertion timeout under cold `next dev` worker contention (see platform-administration.spec).
    await page.goto(`/platform-admin/tenants/${ACME_TENANT_ID}`);
    await expect(page).toHaveURL(/\/select-context\?next=/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible({
      timeout: 15000,
    });
    await selectMuiOption(page, 'Organisation', /Platform/);

    await expect(page).toHaveURL(new RegExp(`/platform-admin/tenants/${ACME_TENANT_ID}$`), {
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Acme SACCO' }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  const AXE_VIEWPORTS = [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ] as const;

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of AXE_VIEWPORTS) {
      test(`context overlays have no serious or critical accessibility violations (${colorScheme}, ${viewport.width}x${viewport.height})`, async ({
        context,
        page,
      }, testInfo) => {
        // Set scheme and viewport before navigating: InitColorSchemeScript reads `matchMedia` on
        // load (see e2e/shell.spec.ts).
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await authenticate(context, testInfo);
        await goToAdminAsGreenfield(page);
        await selectMuiOption(page, 'Branch', /Head Office/);
        await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });

        await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme));
        await expect(page).toHaveTitle(/.+/);

        // Context switcher dialog.
        await page.getByRole('button', { name: /switch organisation or branch/i }).click();
        const dialog = page.getByRole('dialog', { name: /switch working context/i });
        await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible();
        await expect(dialog).toBeInViewport();
        // MUI's Fade sets `opacity` directly on the dialog's transition container (not the
        // dialog paper); axe blends ancestor opacity into color-contrast, so scanning mid-fade
        // can intermittently report a false contrast violation in dark mode.
        await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
        await expectNoSeriousOrCriticalViolations(page);
        await dialog.getByRole('button', { name: 'Close' }).click();
        // Until the exit transition ends, the rest of the app stays aria-hidden and getByRole
        // can't find the trigger below.
        await expect(dialog).toBeHidden();

        // App switcher popover.
        await page.getByRole('button', { name: 'Switch application', exact: true }).click();
        const popover = page.getByRole('dialog', { name: 'Finaxis apps' });
        await expect(popover.getByRole('button', { name: /^Administration/ })).toBeInViewport();
        // Same fade-timing guard: MUI's Grow sets `opacity` directly on the popover paper.
        await expect(popover).toHaveCSS('opacity', '1');
        await expectNoSeriousOrCriticalViolations(page);
        await page.keyboard.press('Escape');
      });
    }
  }
});
