import { expect, test, type Page } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';
import { expectNoSeriousOrCriticalViolations } from './support/admin';
import {
  authenticate,
  clickInMuiPopover,
  clickMuiOption,
  expectHydrated,
  selectMuiOption,
} from './support/auth';

const ACME_TENANT_ID = '99999999-9999-4999-8999-999999999999';

/** Reaches /select-context from /admin and picks Greenfield. */
async function goToAdminAsGreenfield(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/select-context\?next=%2Fadmin$/);
  await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
  await selectMuiOption(page, 'Organisation', /Greenfield/);
}

test.describe('working context', () => {
  test('offers All branches to multi-branch users and shows it in the shell', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /All branches \(institution level\)/);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible();
  });

  test('pins the one branch a member holds through two assignment types', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'duplicate-assignments');
    await goToAdminAsGreenfield(page);

    // HOME and OPERATE at Head Office are one assigned branch (BG-23), so selection pins it — no
    // branch combobox is ever shown for this user.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();
  });

  test('uses institution level for members without branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-branches');
    await goToAdminAsGreenfield(page);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('All branches')).toBeVisible();
  });

  test('switches branch from the app bar dialog', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /Head Office/);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();

    await page.getByRole('button', { name: /switch organisation or branch/i }).click();
    const dialog = page.getByRole('dialog', { name: /switch working context/i });
    await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Organisation' }).click();
    await clickMuiOption(page.getByRole('option', { name: /Greenfield/ }));
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await clickMuiOption(page.getByRole('option', { name: /Westlands/ }));

    // Assert the toast before the banner: the Snackbar auto-hides after 5s, while the banner
    // waits on router.refresh().
    await expect(
      page.getByRole('alert').filter({ hasText: /Switched to Greenfield SACCO/ }),
    ).toBeVisible();
    await expect(page.getByRole('banner').getByText('Westlands Branch')).toBeVisible();
  });

  test('re-selects the current organisation after another tab moved the shared context', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'multi-org');
    // `context.request` shares this browser context's cookie jar, so it stands in for another tab
    // (and skips the /select-context UI the sibling tests already cover).
    const select = async (path: string, data: Record<string, string>) => {
      const response = await context.request.post(path, { data });
      expect(response.ok()).toBe(true);
    };
    await select('/api/context/organisation', { organisation_id: IDS.greenfield });
    await select('/api/context/branch', { branch_id: IDS.headOffice });
    await page.goto('/admin');
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();

    // Another tab moves the shared context cookie to Platform.
    await select('/api/context/organisation', { organisation_id: IDS.platformOrganisation });

    // The first tab still renders Greenfield. Re-picking it must re-select it server-side rather
    // than list Platform's branches under a Greenfield label. A click on the pre-hydration SSR
    // markup is dropped (see expectHydrated), so wait for React to own the button first.
    const contextButton = page.getByRole('button', { name: /switch organisation or branch/i });
    await expectHydrated(contextButton);
    await contextButton.click();
    const dialog = page.getByRole('dialog', { name: /switch working context/i });
    await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Organisation' }).click();
    await clickMuiOption(page.getByRole('option', { name: /Greenfield/ }));
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option', { name: /Westlands/ })).toBeVisible();
    await clickMuiOption(page.getByRole('option', { name: /Westlands/ }));

    await expect(
      page.getByRole('alert').filter({ hasText: /^Switched to Greenfield SACCO$/ }),
    ).toBeVisible();
    await expect(page.getByRole('banner').getByText('Westlands Branch')).toBeVisible();
  });

  test('moves between workspaces with the app switcher', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'multi-org');
    await goToAdminAsGreenfield(page);
    await selectMuiOption(page, 'Branch', /Head Office/);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();

    await page.getByRole('button', { name: 'Switch application', exact: true }).click();
    await clickInMuiPopover(page.getByRole('button', { name: /Platform administration/ }));

    // The platform operator has a single branch, so switching auto-pins it — toast before the
    // banner/URL, per the same auto-hiding-Snackbar-vs-refresh ordering as above. Anchored so a
    // regression that inverted the pin result (landing on All branches instead) would fail here.
    await expect(
      page.getByRole('alert').filter({ hasText: /^Switched to Platform$/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/platform-admin$/);
    await expect(page.getByRole('banner').getByText('Platform', { exact: true })).toBeVisible();
    await expect(page.getByRole('banner').getByText('Platform Operations')).toBeVisible();
  });

  test('keeps a deep link through context selection', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator');

    await page.goto(`/platform-admin/tenants/${ACME_TENANT_ID}`);
    await expect(page).toHaveURL(/\/select-context\?next=/);
    await expect(page.getByRole('heading', { name: 'Select your context' })).toBeVisible();
    await selectMuiOption(page, 'Organisation', /Platform/);

    await expect(page).toHaveURL(new RegExp(`/platform-admin/tenants/${ACME_TENANT_ID}$`));
    await expect(page.getByRole('heading', { name: 'Acme SACCO' }).first()).toBeVisible();
  });

  const AXE_VIEWPORTS = [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ] as const;

  test.describe('context overlays accessibility', () => {
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
          await expect(page).toHaveURL(/\/admin$/);

          // The URL updates before the /admin page has streamed in: app/loading.tsx's 'Loading…'
          // fallback can still be showing, with an empty document title, right after the URL match.
          // /admin/page.tsx's `metadata` is a static object (not `generateMetadata`), so it can't
          // stream in separately from the page body (see streaming-metadata docs) — waiting for
          // the page's own heading also waits for the title.
          await expect(
            page.getByRole('heading', { level: 1, name: 'Administration Overview' }),
          ).toBeVisible();

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
});
