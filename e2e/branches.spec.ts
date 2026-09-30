import { expect, test, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate, selectMuiOption } from './support/auth';
import { BRANCH_SCENARIO_IDS, IDS } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const MAKER_CHECKER = 'You drafted this branch, so another administrator must activate it.';

async function openDirectory(page: Page, branch: RegExp | null = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/branches', { heading: 'Branches', branch });
}

async function openRecord(page: Page, name: string) {
  await page
    .getByRole('table', { name: 'Branches' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

/** A hero lifecycle action through its dialog; the caller asserts the outcome. */
async function lifecycle(page: Page, label: string, reason?: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

const statusChip = (page: Page, value: string) => page.getByText(value, { exact: true }).first();
const rowsOf = (page: Page, table: string) =>
  page.getByRole('table', { name: table }).getByRole('row');

test.describe('branches', () => {
  // A branch route can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('searches, filters, and sorts the directory through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);

    await expect(page.getByText('6 branches')).toBeVisible();
    await expect(rowsOf(page, 'Branches')).toHaveCount(7);

    await page.getByRole('searchbox', { name: 'Search' }).fill('west');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=west/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches')).toHaveCount(2);

    // Wait for each cleared render (as audit.spec does): the next push builds on the rendered
    // query, and the sort headers' hrefs are server-built from it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 branches')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expect(page).toHaveURL(/status=SUSPENDED/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Kisumu Branch');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 branches')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Branch', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=branchName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Head Office');
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortDir=DESC/, { timeout: 15000 });
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Westlands Branch');
  });

  test('creates a draft, submits it, and blocks the drafter from activating it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);

    await page.getByRole('link', { name: 'Create branch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create branch' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('textbox', { name: 'Branch code' }).fill('nairobi cbd');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(
      page.getByText('Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeVisible();

    await page.getByRole('textbox', { name: 'Branch code' }).fill('NAIROBI_CBD');
    await page.getByRole('textbox', { name: 'Branch name' }).fill('Nairobi CBD Branch');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/admin\/branches\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Nairobi CBD Branch' })).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();

    const dialog = await lifecycle(page, 'Submit for approval');
    await expect(dialog).toBeHidden();
    // PF6: Submit leaves only a disabled Activate (the drafter can't activate their own draft), so
    // focus falls back to the record title (I3's third rung).
    await expect(page.getByRole('heading', { level: 1, name: 'Nairobi CBD Branch' })).toBeFocused();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Submitted for approval' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Pending approval')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeDisabled();
    await expect(page.getByText(MAKER_CHECKER)).toBeVisible();
  });

  test('activates a branch another administrator drafted and shows it in the audit tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Thika Road Branch');

    await lifecycle(page, 'Activate');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();

    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page).toHaveURL(/\/audit$/, { timeout: 15000 });
    await expect(page.getByRole('table', { name: 'Audit events' })).toContainText(
      'Activated branch',
    );
  });

  test('suspends with a required reason, shows it, and reactivates', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');

    await lifecycle(page, 'Suspend', 'Cash count');
    await expect(page.getByRole('dialog')).toBeHidden();
    // PF6: Suspend leaves Reactivate as the first enabled action, so focus lands there (I3's
    // first rung — the same action's replacement is still on offer).
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeFocused();
    await expect(statusChip(page, 'Suspended')).toBeVisible();
    await expect(page.getByText('Cash count')).toBeVisible();

    await lifecycle(page, 'Reactivate');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();
  });

  test('explains a blocked close and closes a branch with nothing assigned', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');

    const blocked = await lifecycle(page, 'Close branch', 'Relocating');
    await expect(blocked.getByRole('alert')).toContainText(
      "can't be closed while users are assigned",
    );
    await blocked.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Back to branches' }).click();
    await openRecord(page, 'Kisumu Branch');
    await lifecycle(page, 'Close branch', 'Consolidated into Westlands');
    await expect(page.getByRole('dialog')).toBeHidden();
    // PF6: Close empties the action set, unmounting BranchLifecycleActions, so the unmount
    // cleanup's fallback (I3's third rung) focuses the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Kisumu Branch' })).toBeFocused();
    await expect(statusChip(page, 'Closed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
  });

  test('assigns and revokes branch users, and explains a last assignment', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page);
    await openRecord(page, 'Westlands Branch');
    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(4, { timeout: 15000 }); // header + 3

    await page.getByRole('button', { name: 'Assign user' }).click();
    const drawer = page.getByRole('dialog', { name: 'Assign a user' });
    await drawer.getByRole('combobox', { name: /^User/ }).fill('peter');
    await page.getByRole('option', { name: /Peter Otieno/ }).click();
    await selectMuiOption(page, 'Assignment type', /^Approve$/);
    await drawer.getByRole('button', { name: 'Assign user' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('alert').filter({ hasText: 'User assigned' })).toBeVisible();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(5);

    // RevokeAssignmentButton's ConfirmDialog is tone="error", so MUI renders role="alertdialog"
    // (07b kit), not "dialog" — the plain `lifecycle()` helper's dialogs (ReasonDialog, no tone)
    // stay role="dialog".
    await page.getByRole('button', { name: "Revoke Peter Otieno's Operate assignment" }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    // PF6: revoking removes Peter's row, unmounting that RevokeAssignmentButton, so its unmount
    // cleanup falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Westlands Branch' })).toBeFocused();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(4);

    await page.getByRole('button', { name: "Revoke Mary Wanjiku's Home assignment" }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText(
      'last branch assignment',
    );
  });

  test('guides a branch context to All branches for another branch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page, /Head Office/);

    await page.goto(`/admin/branches/${BRANCH_SCENARIO_IDS.thikaRoad}`);
    await expect(page.getByText('Switch to All branches to manage this branch')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Switch to All branches' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Switched to Greenfield SACCO · All branches' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Thika Road Branch' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('suspending the working branch sends the user back to context selection (index item 1)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'branches');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Westlands Branch');

    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('You are working in this branch');
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Cash count');
    await dialog.getByRole('button', { name: 'Suspend', exact: true }).click();
    // The selected branch left ACTIVE, so its context token is now invalid (contract §E.4): the
    // refresh must land on context selection, never an error page.
    await expect(page).toHaveURL(/\/select-context/, { timeout: 15000 });
  });

  test('offers no mutations without the permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo); // default: branch reads only
    await openDirectory(page);

    await expect(page.getByRole('link', { name: 'Branches', exact: true })).toBeVisible(); // rail
    await expect(page.getByRole('link', { name: 'Create branch' })).toHaveCount(0);
    await openRecord(page, 'Westlands Branch');
    await expect(page.getByRole('button', { name: /^(Suspend|Close branch)$/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(rowsOf(page, 'Branch users')).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Assign user' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);

    await page.goto('/admin/branches/new');
    // Scoped to `main`: on one run this matched two nodes (a strict-mode violation) with only one
    // inside `main`. It didn't reproduce on a repeat of this test alone, so it reads as `next dev`
    // (Fast Refresh/streaming) transient duplication rather than a component rendering the message
    // twice (`ForbiddenState` has exactly one call site here) — scoping to `main` is deterministic
    // either way and matches what a user/screen-reader perceives as the page's content.
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible({
      timeout: 15000,
    });
  });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'branches');
      await openDirectory(page);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      for (const [path, heading] of [
        ['/admin/branches/new', 'Create branch'],
        [`/admin/branches/${BRANCH_SCENARIO_IDS.oldTown}`, /^Old Town Branch/],
        [`/admin/branches/${IDS.westlands}/users`, 'Westlands Branch'],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }

      await page.getByRole('button', { name: 'Assign user' }).click();
      await expect(page.getByRole('dialog', { name: 'Assign a user' })).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);
    });
  }
});
