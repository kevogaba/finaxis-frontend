import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_EDIT_ENABLED } from '../modules/administration/settings/settings-flags';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate } from './support/auth';

const enter = (page: Page) => enterAdmin(page, '/admin/settings', { heading: 'Settings' });
const row = (page: Page, name: string) => page.getByRole('group', { name });
const EDIT_UNAVAILABLE = /Editing isn't available yet/;

async function reset(page: Page, label: string) {
  await row(page, label).getByRole('button', { name: 'Reset to default' }).click();
  const dialog = page.getByRole('dialog', { name: `Reset ${label.toLowerCase()}?` });
  await dialog.getByRole('button', { name: 'Reset to default' }).click();
  return dialog;
}

test.describe('settings', () => {
  // /admin/settings can be the first hit of its route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('shows the catalogue in groups, honest read-only labels, and collapsed extras', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Settings' }),
    ).toBeVisible();
    await expect(row(page, 'Default timezone')).toContainText('Africa/Nairobi');
    await expect(row(page, 'Base currency')).toContainText('KES · Kenyan Shilling');
    await expect(row(page, 'Maker-checker for user invites')).toContainText(
      'Maker-checker always applies',
    );
    await expect(row(page, 'Automatic business date advance')).toContainText(
      'Automatic advance is not available yet',
    );
    await expect(row(page, 'Audit retention')).toContainText('Managed by the platform');
    await expect(row(page, 'Audit retention').getByRole('button')).toHaveCount(0);
    await expect(page.getByText('***REDACTED***')).toHaveCount(0);

    await page.getByRole('button', { name: 'Other stored settings (2)' }).click();
    await expect(row(page, 'settings.operational')).toBeVisible();
    await expect(row(page, 'business-date.timezone').getByRole('button')).toHaveCount(0);
  });

  test('ships editing disabled with a visible explanation (BG-04)', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(SETTINGS_EDIT_ENABLED, 'The PUT probe passed: editing ships enabled.');
    await authenticate(context, testInfo);
    await enter(page);

    await expect(
      row(page, 'Default timezone').getByRole('button', { name: 'Edit' }),
    ).toBeDisabled();
    await expect(row(page, 'Base currency').getByRole('button', { name: 'Edit' })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Locale & currency' })).toContainText(
      EDIT_UNAVAILABLE,
    );
  });

  test('edits the timezone from the runtime list', async ({ context, page }, testInfo) => {
    test.skip(!SETTINGS_EDIT_ENABLED, 'BG-04: editing ships disabled until the PUT probe passes.');
    await authenticate(context, testInfo);
    await enter(page);

    await row(page, 'Default timezone').getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit default timezone' });
    await dialog.getByRole('combobox', { name: 'Timezone' }).selectOption('Africa/Kampala');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, 'Default timezone')).toContainText('Africa/Kampala');
  });

  test('resets a stored value to its default', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await row(page, 'Default timezone').getByRole('button', { name: 'Reset to default' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset default timezone?' });
    await dialog
      .getByRole('textbox', { name: 'Reason (optional)' })
      .fill('Use the platform default');
    await dialog.getByRole('button', { name: 'Reset to default' }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Default timezone reset to default' }),
    ).toBeVisible();
    // I3: with editing disabled, Edit stays disabled, so focus falls back to the row group
    // (SettingRow's role="group" Box, tabIndex={-1}), never <body>.
    await expect(row(page, 'Default timezone')).toBeFocused();
    await expect(row(page, 'Default timezone')).toContainText('Not set');
    await expect(
      row(page, 'Default timezone').getByRole('button', { name: 'Reset to default' }),
    ).toHaveCount(0);
  });

  test('explains a frozen base currency instead of resetting it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'settings-currency-frozen');
    await enter(page);

    const dialog = await reset(page, 'Base currency');
    await expect(dialog.getByRole('alert')).toContainText('already posted journals');
    await page.keyboard.press('Escape');
    await expect(row(page, 'Base currency')).toContainText('KES');
    // The refusal didn't consume the action: Reset is still offered, not silently removed.
    await expect(
      row(page, 'Base currency').getByRole('button', { name: 'Reset to default' }),
    ).toBeVisible();
  });

  test('offers no changes without settings.update', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'settings-read-only');
    await enter(page);

    await expect(row(page, 'Base currency')).toContainText('KES');
    await expect(
      page.getByRole('main').getByRole('button', { name: /^(Edit|Reset to default)$/ }),
    ).toHaveCount(0);
    await expect(page.getByText(EDIT_UNAVAILABLE)).toHaveCount(0);
  });

  test('shows the forbidden state and no nav entry without settings.view', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-settings-permission');
    await enter(page);

    await expect(page.getByText("You don't have permission")).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Settings' }),
    ).toHaveCount(0);
  });

  test.describe('accessibility', () => {
    test.describe.configure({ timeout: 90000 });

    for (const a11yCase of A11Y_CASES) {
      test(`has no serious a11y violations (${a11yCase.colorScheme}, ${a11yCase.label}; extras and dialog open)`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo);
        await enter(page);

        // Expanded, so the long stored value is on screen for the 375 px no-scroll check.
        await page.getByRole('button', { name: /Other stored settings/ }).click();
        await expect(row(page, 'settings.operational')).toBeVisible();
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);

        await row(page, 'Base currency').getByRole('button', { name: 'Reset to default' }).click();
        const dialog = page.getByRole('dialog', { name: 'Reset base currency?' });
        await expect(dialog).toBeVisible();
        // MUI's Fade sets `opacity` directly on the dialog's transition container; axe blends
        // ancestor opacity into color-contrast, so scanning mid-fade can intermittently report a
        // false contrast violation (business-date.spec.ts:314, context.spec.ts:255).
        await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  });
});
