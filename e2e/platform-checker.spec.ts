import { expect, test, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
} from './support/admin';
import { authenticate, expectHydrated } from './support/auth';
import { CHECKER_SCENARIO_IDS as C } from './fake-api/scenarios.mts';

const BIDII = `/platform-admin/tenants/${C.bidii}`;
const TUMAINI = `/platform-admin/tenants/${C.tumaini}`;

/** A platform page through context selection (the operator's one branch is picked by itself). */
const enterPlatform = (page: Page, pathname: string, heading: string) =>
  enterAdmin(page, pathname, { heading, organisation: /Platform/, branch: null });

/** A toast: MUI alerts in the toast region, never the page's notes. */
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** Opens a row action's dialog: a click on the server-rendered button before React claims it
 * opens nothing. */
async function open(page: Page, name: string, dialog: string) {
  const trigger = page.getByRole('button', { name, exact: true });
  await expectHydrated(trigger);
  await trigger.click();
  const opened = page.getByRole('dialog', { name: dialog });
  await expect(opened).toBeVisible();
  return opened;
}

test.describe('platform checker: members (BG-02)', () => {
  test("approves a new institution's first member, and then leaves the rest to it", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${BIDII}/users`, 'Bidii Traders SACCO');

    await expect(
      mainText(
        page,
        'Platform checking is open: Bidii Traders SACCO has no active member besides its first administrator, so a platform administrator can approve its first members.',
      ),
    ).toBeVisible();
    // Jane invited Halima: the platform checker is never the maker.
    const halima = page.getByRole('button', { name: 'Approve Halima Said', exact: true });
    await expect(halima).toBeDisabled();
    await expect(halima).toHaveAccessibleDescription(
      'You invited this user, so another administrator must approve them.',
    );

    const dialog = await open(page, 'Approve Otieno Ouma', 'Approve Otieno Ouma?');
    await expect(dialog).toContainText(
      "The institution's audit log records you as the platform checker.",
    );
    await dialog.getByRole('textbox', { name: 'Remark (optional)' }).fill('Known to the board');
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();

    await expect(toast(page, 'Approved. Their membership is active.')).toBeVisible();
    // Otieno is a second active member: the institution approves the rest, so no row offers
    // Approve any more, and focus goes to the record title rather than the page.
    await expect(mainText(page, 'Bidii Traders SACCO now approves its own members.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Approve / })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bidii Traders SACCO' }),
    ).toBeFocused();
  });

  test('offers no Approve where the institution already has its own approvers', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${TUMAINI}/users`, 'Tumaini Savings SACCO');

    await expect(
      mainText(page, 'Tumaini Savings SACCO now approves its own members.'),
    ).toBeVisible();
    // Njoki still waits, for Tumaini's own administrators.
    await expect(
      page.getByRole('table', { name: 'Users' }).getByRole('link', { name: 'Njoki Wambui' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Approve / })).toHaveCount(0);
  });

  test("shows a read-only role neither the window nor the checker's actions", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker-read-only');
    await enterPlatform(page, `${BIDII}/users`, 'Bidii Traders SACCO');

    await expect(
      page.getByRole('table', { name: 'Users' }).getByRole('link', { name: 'Otieno Ouma' }),
    ).toBeVisible();
    await expect(page.getByRole('main').getByRole('note')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Approve / })).toHaveCount(0);
  });
});

test.describe('platform checker: branches (BG-02)', () => {
  test('activates a first branch, after which only its submitter may still withdraw one', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${BIDII}/branches`, 'Bidii Traders SACCO');

    await expect(
      mainText(
        page,
        'Platform checking is open: Bidii Traders SACCO has no active branch besides its head office, so a platform administrator can submit, return and activate its first branches.',
      ),
    ).toBeVisible();
    // Jane submitted Eldoret: she may withdraw it, never activate it.
    const eldoret = page.getByRole('button', { name: 'Activate Eldoret Branch', exact: true });
    await expect(eldoret).toBeDisabled();
    await expect(eldoret).toHaveAccessibleDescription(
      'You created or submitted this branch, so another administrator must activate it.',
    );

    const dialog = await open(page, 'Activate Nakuru Branch', 'Activate Nakuru Branch?');
    await dialog.getByRole('button', { name: 'Activate', exact: true }).click();

    await expect(toast(page, 'Branch activated')).toBeVisible();
    await expect(
      mainText(page, 'Bidii Traders SACCO now approves its own branches.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Submit|Return|Activate) / })).toHaveCount(0);
    // Taking back one's own request isn't bounded by the window.
    await expect(
      page.getByRole('button', { name: 'Withdraw Eldoret Branch', exact: true }),
    ).toBeVisible();
  });

  test('submits a draft and returns a pending branch for changes', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${BIDII}/branches`, 'Bidii Traders SACCO');

    const submit = await open(
      page,
      'Submit Kisumu Branch for approval',
      'Submit Kisumu Branch for approval?',
    );
    await submit.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await expect(toast(page, 'Submitted for approval')).toBeVisible();
    // Its submitter now: Withdraw takes focus, and Activate is disabled.
    await expect(
      page.getByRole('button', { name: 'Withdraw Kisumu Branch', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Activate Kisumu Branch', exact: true }),
    ).toBeDisabled();

    const send = await open(
      page,
      'Return Nakuru Branch for changes',
      'Return Nakuru Branch for changes?',
    );
    await send.getByRole('textbox', { name: 'What needs to change' }).fill('Use the town code');
    await send.getByRole('button', { name: 'Return for changes', exact: true }).click();
    await expect(toast(page, 'Returned for changes')).toBeVisible();
    // Back to a draft, which the checker may submit again.
    await expect(
      page.getByRole('button', { name: 'Submit Nakuru Branch for approval', exact: true }),
    ).toBeVisible();
  });

  test('offers no checker action where the institution already has its own branch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${TUMAINI}/branches`, 'Tumaini Savings SACCO');

    await expect(
      mainText(page, 'Tumaini Savings SACCO now approves its own branches.'),
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Branches' }).getByRole('link', { name: 'Meru Branch' }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
  });

  test("creates a draft in an institution you aren't a member of (BG-18)", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-checker');
    await enterPlatform(page, `${BIDII}/branches/new`, 'Create branch draft');

    await expect(page.getByRole('main').getByRole('note')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Branch code' }).fill('THIKA');
    await page.getByRole('textbox', { name: 'Branch name' }).fill('Thika Road Branch');
    const create = page.getByRole('button', { name: 'Create draft' });
    await expectHydrated(create);
    await create.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Thika Road Branch' })).toBeVisible();
  });
});

const SURFACES = [
  { label: 'users tab, window open', path: `${BIDII}/users`, heading: 'Bidii Traders SACCO' },
  { label: 'branches tab, window open', path: `${BIDII}/branches`, heading: 'Bidii Traders SACCO' },
  // The closed note is the success-toned one.
  {
    label: 'users tab, window closed',
    path: `${TUMAINI}/users`,
    heading: 'Tumaini Savings SACCO',
  },
  {
    label: 'approve dialog',
    path: `${BIDII}/users`,
    heading: 'Bidii Traders SACCO',
    open: (page: Page) => open(page, 'Approve Otieno Ouma', 'Approve Otieno Ouma?'),
  },
] as const;

test.describe('platform checker: accessibility', () => {
  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'platform-checker');
        await enterPlatform(page, surface.path, surface.heading);
        // The note is the window's own read: the tab has settled once it shows. (No bell: this
        // operator holds no `tenant.approve`.)
        await expect(page.getByRole('main').getByRole('note')).toBeVisible();
        if ('open' in surface) {
          await surface.open(page);
          // Scan once the fade has finished: axe blends ancestor opacity into colour contrast.
          await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
        }
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  }
});
