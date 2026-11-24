import { expect, test, type Page } from '@playwright/test';
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
const toggle = (page: Page, name: string) => page.getByRole('switch', { name });
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

const INVITES = 'Require maker-checker for user invitations';
const ADVANCE = 'Advance the business date automatically';
// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports.
const ADVANCE_NEEDS_PERMISSION =
  'Turning on automatic advance needs permission to advance the business date.';

test.describe('settings', () => {
  test("files the platform's catalogue under its groups, with read-only base currency and retention", async ({
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
    for (const group of ['General', 'Approvals', 'Business date', 'Audit']) {
      await expect(page.getByRole('main').getByRole('region', { name: group })).toBeVisible();
    }
    await expect(row(page, 'Default time zone')).toContainText('Africa/Nairobi');
    await expect(row(page, 'Base currency')).toContainText('KES · Kenyan Shilling');
    await expect(row(page, 'Base currency')).toContainText(
      "Set from the institution's currency. It can't be changed here.",
    );
    await expect(row(page, 'Base currency')).toContainText('Read-only');
    await expect(row(page, 'Base currency').getByRole('button')).toHaveCount(0);
    await expect(row(page, 'Audit retention (days)')).toContainText('Managed by the platform');
    await expect(row(page, 'Audit retention (days)').getByRole('button')).toHaveCount(0);
    await expect(toggle(page, INVITES)).toBeChecked();
    await expect(toggle(page, 'Require maker-checker for branch creation')).toBeChecked();
    await expect(toggle(page, ADVANCE)).not.toBeChecked();
    await expect(page.getByText('***REDACTED***')).toHaveCount(0);

    await page.getByRole('button', { name: 'Other stored settings (1)' }).click();
    await expect(row(page, 'legacy.operational_profile')).toBeVisible();
    await expect(row(page, 'legacy.operational_profile').getByRole('button')).toHaveCount(0);
  });

  test('edits the time zone from the IANA list, then resets it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await row(page, 'Default time zone').getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit default time zone' });
    const zone = edit.getByRole('combobox', { name: 'Time zone' });
    await zone.fill('Kampala');
    await page.getByRole('option', { name: 'Africa/Kampala' }).click();
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await expect(toast(page, 'Default time zone updated')).toBeVisible();
    await expect(row(page, 'Default time zone')).toContainText('Africa/Kampala');

    await row(page, 'Default time zone').getByRole('button', { name: 'Reset to default' }).click();
    const reset = page.getByRole('dialog', { name: 'Reset default time zone?' });
    await reset
      .getByRole('textbox', { name: 'Reason (optional)' })
      .fill('Use the platform default');
    await reset.getByRole('button', { name: 'Reset to default' }).click();
    await expect(reset).toBeHidden();
    await expect(toast(page, 'Default time zone reset to default')).toBeVisible();
    // I3: the Reset button is gone, so focus lands on Edit, never <body>.
    await expect(
      row(page, 'Default time zone').getByRole('button', { name: 'Edit' }),
    ).toBeFocused();
    await expect(row(page, 'Default time zone')).toContainText('Not set');
    await expect(
      row(page, 'Default time zone').getByRole('button', { name: 'Reset to default' }),
    ).toHaveCount(0);
  });

  test('turns the user-invitation switch off with a reason, and on again', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enter(page);

    await toggle(page, INVITES).click();
    const off = page.getByRole('dialog', { name: 'Turn off maker-checker for user invitations?' });
    await expect(off).toContainText(
      'The person who invites someone will be able to approve them, and the invited person will be able to approve their own membership. Each such approval is recorded as a high-severity event.',
    );
    const reason = off.getByRole('textbox', { name: 'Reason' });
    await expect(reason).toHaveAttribute('required', '');
    await reason.fill('Two-person team for now');
    await off.getByRole('button', { name: 'Turn off' }).click();
    await expect(off).toBeHidden();
    await expect(toast(page, 'Maker-checker for user invitations turned off')).toBeVisible();
    await expect(toggle(page, INVITES)).not.toBeChecked();
    await expect(row(page, INVITES)).toContainText('Off');
    // A stored value: Reset to default is offered.
    await expect(
      row(page, INVITES).getByRole('button', { name: 'Reset to default' }),
    ).toBeVisible();

    await toggle(page, INVITES).click();
    const on = page.getByRole('dialog', { name: 'Turn on maker-checker for user invitations?' });
    await expect(on.getByRole('textbox', { name: 'Reason (optional)' })).toBeVisible();
    await on.getByRole('button', { name: 'Turn on' }).click();
    await expect(on).toBeHidden();
    await expect(toggle(page, INVITES)).toBeChecked();
    await expect(row(page, INVITES)).toContainText('On');
  });

  test('explains why automatic advance needs the advance permission', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'business-date-read-only');
    await enter(page);

    await expect(toggle(page, ADVANCE)).toBeDisabled();
    await expect(row(page, ADVANCE)).toContainText(ADVANCE_NEEDS_PERMISSION);
    await expect(toggle(page, INVITES)).toBeEnabled();
  });

  test('offers no changes without settings.update', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'settings-read-only');
    await enter(page);

    await expect(row(page, 'Base currency')).toContainText('KES');
    await expect(
      page.getByRole('main').getByRole('button', { name: /^(Edit|Reset to default)$/ }),
    ).toHaveCount(0);
    await expect(toggle(page, INVITES)).toBeDisabled();
    await expect(toggle(page, ADVANCE)).toBeDisabled();
    await expect(page.getByText(ADVANCE_NEEDS_PERMISSION)).toHaveCount(0);
  });

  test('shows the forbidden state and no nav entry without settings.view', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'no-settings-permission');
    await enter(page);

    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Settings' }),
    ).toHaveCount(0);
  });

  test.describe('accessibility', () => {
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
        await expect(row(page, 'legacy.operational_profile')).toBeVisible();
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);

        await toggle(page, INVITES).click();
        const dialog = page.getByRole('dialog', {
          name: 'Turn off maker-checker for user invitations?',
        });
        await expect(dialog).toBeVisible();
        // MUI's Fade sets `opacity` directly on the dialog's transition container; axe blends
        // ancestor opacity into color-contrast, so scanning mid-fade can intermittently report a
        // false contrast violation (the same Fade wait in business-date.spec and context.spec).
        await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  });
});
