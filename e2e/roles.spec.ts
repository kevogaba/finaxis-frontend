import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  type A11yCase,
} from './support/admin';
import { authenticate, selectMuiOption } from './support/auth';
import { ROLE_SCENARIO_IDS } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const COMPLIANCE =
  'Compliance, risk and internal audit reviewer for member savings and credit operations';

async function openDirectory(page: Page, branch: RegExp | null = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/roles', { heading: 'Roles & permissions', branch });
}

async function openRecord(page: Page, name: string) {
  await page.getByRole('table', { name: 'Roles' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

async function openTab(page: Page, tab: 'Permissions' | 'Assignments' | 'Audit') {
  await page.getByRole('tab', { name: tab }).click();
  await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`), { timeout: 15000 });
}

// Scoped to `main`, as in branches.spec.ts: a streamed route can briefly leave a hidden duplicate
// segment, and `getByRole('main')` only resolves the rendered, visible landmark.
const mainText = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByRole('main').getByText(value, options);
const rowsOf = (page: Page, table: string) =>
  page.getByRole('table', { name: table }).getByRole('row');

test.describe('roles', () => {
  // A roles route can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('searches, filters, and sorts the directory through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);

    await expect(mainText(page, '6 roles')).toBeVisible();
    await expect(rowsOf(page, 'Roles')).toHaveCount(7);
    // Newest first by default (Ruling 2).
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText(COMPLIANCE);

    await page.getByRole('searchbox', { name: 'Search' }).fill('tell');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=tell/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles')).toHaveCount(2);

    // Wait for each cleared render (as branches.spec does): the next push builds on the rendered
    // query, and the sort headers' hrefs are server-built from it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Type', /^System role$/);
    await expect(page).toHaveURL(/type=system/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles')).toHaveCount(3);

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Disabled$/);
    await expect(page).toHaveURL(/status=DISABLED/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Loans officer');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '6 roles')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Role', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=roleName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Branch manager');
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortDir=DESC/, { timeout: 15000 });
    await expect(rowsOf(page, 'Roles').nth(1)).toContainText('Tenant admin');
  });

  test('creates a role, grants from the grouped catalogue, and confirms a critical removal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);

    await page.getByRole('link', { name: 'Create role' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create role' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('textbox', { name: 'Role code' }).fill('credit clerk');
    await page.getByRole('button', { name: 'Create role' }).click();
    await expect(
      mainText(page, 'Use 2–20 capital letters, digits, underscores or hyphens.'),
    ).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Check Role code, Role name.',
    );

    await page.getByRole('textbox', { name: 'Role code' }).fill('CREDIT_CLERK');
    await page.getByRole('textbox', { name: 'Role name' }).fill('Credit clerk');
    await page.getByRole('button', { name: 'Create role' }).click();
    await expect(page).toHaveURL(/\/admin\/roles\/[0-9a-f-]{36}\/permissions$/, {
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Credit clerk' })).toBeVisible();
    await expect(mainText(page, 'No permissions granted')).toBeVisible();

    await page.getByRole('button', { name: 'Grant permissions' }).click();
    const drawer = page.getByRole('dialog', { name: 'Grant permissions' });
    const search = drawer.getByRole('searchbox', { name: 'Search permissions' });
    await search.fill('business date');
    // Enter filters; it never submits the drawer.
    await search.press('Enter');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('checkbox', { name: /^View business date/ }).check();
    await drawer.getByRole('checkbox', { name: /^Advance business date/ }).check();
    await search.fill('');
    await selectMuiOption(page, 'Risk', /^High$/);
    await drawer.getByRole('checkbox', { name: /^Start close of business/ }).check();
    await expect(drawer.getByRole('status')).toHaveText('3 selected');
    await drawer.getByRole('button', { name: 'Grant permissions' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Permissions granted' })).toBeVisible();
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(4); // header + 3

    await page.getByRole('button', { name: 'Remove Advance business date' }).click();
    const critical = page.getByRole('alertdialog');
    await expect(critical).toContainText('is a critical permission');
    await critical.getByRole('button', { name: 'Remove' }).click();
    await expect(critical).toBeHidden();
    // I3: the removed row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Credit clerk' })).toBeFocused();
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(3);
  });

  test('keeps keyboard focus clear of the grant drawer footer (WCAG 2.4.11)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    // Operations supervisor holds three codes, so the drawer lists the rest of the catalogue: far
    // more rows than one screenful, which is what lets a Tab stop land under the sticky footer.
    await enterAdmin(page, `/admin/roles/${ROLE_SCENARIO_IDS.opsSupervisor}/permissions`, {
      heading: 'Operations supervisor',
    });
    await page.getByRole('button', { name: 'Grant permissions' }).click();
    const drawer = page.getByRole('dialog', { name: 'Grant permissions' });
    await expect(drawer).toBeVisible();
    // The sticky action bar: the parent of Cancel and the submit button.
    const footer = drawer.getByRole('button', { name: 'Cancel' }).locator('xpath=..');
    await drawer.getByRole('searchbox', { name: 'Search permissions' }).focus();

    let checkboxes = 0;
    for (let press = 0; press < 80; press += 1) {
      await page.keyboard.press('Tab');
      // Pixels between the focused checkbox's bottom edge and the footer's top edge; null when
      // focus is not on a checkbox (the Risk select before the list, Cancel after it).
      const clearance = await footer.evaluate((bar) => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLInputElement) || focused.type !== 'checkbox') return null;
        return bar.getBoundingClientRect().top - focused.getBoundingClientRect().bottom;
      });
      if (clearance === null) {
        if (checkboxes > 0) break; // focus left the list
        continue;
      }
      checkboxes += 1;
      expect(clearance, `checkbox ${checkboxes} is covered by the footer`).toBeGreaterThanOrEqual(
        0,
      );
    }
    // A long list is what makes the check meaningful.
    expect(checkboxes).toBeGreaterThanOrEqual(40);
  });

  test('edits a custom role, toggles its status, and keeps a system role read-only', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, 'Teller');

    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(/\/edit$/, { timeout: 15000 });
    await expect(page.getByRole('textbox', { name: 'Role code' })).toHaveAttribute('readonly');
    await page.getByRole('textbox', { name: 'Role name' }).fill('Senior teller');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Senior teller' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/admin/roles/${ROLE_SCENARIO_IDS.teller}$`));

    await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(dialog).toBeHidden();
    // I3: the toggle's replacement takes focus.
    await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeFocused();
    await expect(page.getByRole('alert').filter({ hasText: 'Role deactivated' })).toBeVisible();
    // The hero chip and the Overview's Status row both say so.
    await expect(mainText(page, 'Disabled', { exact: true }).first()).toBeVisible();

    // The Audit tab lists the deactivation, which pins its ROLE / role-id filter.
    await openTab(page, 'Audit');
    await expect(page.getByRole('table', { name: 'Audit events' })).toContainText(
      'Deactivated role',
      { timeout: 15000 },
    );

    await page.getByRole('link', { name: 'Back to roles' }).click();
    await openRecord(page, 'Tenant admin');
    await expect(mainText(page, 'TENANT_ADMIN · System role')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Deactivate|Activate)$/ })).toHaveCount(0);
    await openTab(page, 'Permissions');
    await expect(mainText(page, /System roles are immutable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grant permissions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  });

  test('explains a missing branch assignment, assigns at the right branch, and revokes', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, 'Teller');
    // The Overview's assignment count and the Audit tab are the positive controls for the
    // `roles-limited` case.
    await expect(mainText(page, 'Active assignments')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Audit' })).toBeVisible();
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3, { timeout: 15000 }); // header + 2

    await page.getByRole('button', { name: 'Assign role' }).click();
    const drawer = page.getByRole('dialog', { name: 'Assign this role' });
    await drawer.getByRole('combobox', { name: /^User/ }).fill('tom');
    await page.getByRole('option', { name: /Tom Kiprop/ }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Tom is assigned at Head Office only (the `roles` scenario).
    await selectMuiOption(page, 'Branch', /^Westlands Branch/);
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer.getByRole('alert')).toContainText(
      'must already be assigned to that branch',
    );

    // The drawer kept the user, the scope and the key; only the branch changes for the retry.
    await selectMuiOption(page, 'Branch', /^Head Office/);
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Role assigned' })).toBeVisible();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4);

    await page
      .getByRole('button', { name: "Revoke Tom Kiprop's Teller assignment (institution-wide)" })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    // I3: the revoked row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Teller' })).toBeFocused();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3);
  });

  test('warns before you revoke your own assignment (Review Focus 3)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, COMPLIANCE);
    await openTab(page, 'Assignments');

    await page
      .getByRole('button', {
        name: `Revoke Backend Jane Manager's ${COMPLIANCE} assignment (institution-wide)`,
      })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('This is your own assignment');
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(dialog).toBeHidden();
    // Jane keeps TENANT_ADMIN, so the page survives her own revoke.
    await expect(mainText(page, 'Nobody holds this role')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: COMPLIANCE })).toBeVisible();
  });

  test("does not warn when you revoke someone else's assignment", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');

    await page
      .getByRole('button', { name: "Revoke Tom Kiprop's Teller assignment (institution-wide)" })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Tom Kiprop loses Teller (institution-wide) immediately.');
    await expect(dialog).not.toContainText('This is your own assignment');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('offers only the selected branch for a branch-scoped assignment in a branch context', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');

    await page.getByRole('button', { name: 'Assign role' }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    await page.getByRole('combobox', { name: 'Branch' }).click();
    // Contract §E.4: a BRANCH assignment at another branch would be a 404 here.
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
  });

  test('hides Revoke for a branch assignment at another branch, but not a tenant-wide one', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page, /Head Office/);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3, { timeout: 15000 }); // header + 2

    // Contract §E.4: Grace holds Teller at Westlands only, so a Head Office context would get a
    // 404 revoking it. Tom holds it institution-wide, which any branch may revoke.
    await expect(page.getByRole('row', { name: /Grace Achieng/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revoke Grace Achieng/ })).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: "Revoke Tom Kiprop's Teller assignment (institution-wide)",
      }),
    ).toBeVisible();
  });

  test('offers Revoke for a branch assignment at the selected branch', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Teller');
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(3, { timeout: 15000 }); // header + 2

    await expect(
      page.getByRole('button', {
        name: "Revoke Grace Achieng's Teller assignment (Westlands Branch)",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: "Revoke Tom Kiprop's Teller assignment (institution-wide)",
      }),
    ).toBeVisible();
  });

  test('explains that a disabled role must be activated before it can be assigned', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'roles'); // Jane holds user.assign_role and user.view
    await openDirectory(page);
    await openRecord(page, 'Loans officer');
    await openTab(page, 'Assignments');

    await expect(mainText(page, 'Activate this role to assign it.', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
  });

  test('offers no mutations without the permissions', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo); // default: role reads only
    await openDirectory(page);

    await expect(
      page.getByRole('link', { name: 'Roles & permissions', exact: true }),
    ).toBeVisible(); // rail
    await expect(page.getByRole('link', { name: 'Create role' })).toHaveCount(0);
    await openRecord(page, 'Tenant admin');
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await openTab(page, 'Permissions');
    // Default TENANT_ADMIN holds 19 codes: page 1 of 2 at the default size of 10.
    await expect(rowsOf(page, 'Granted permissions')).toHaveCount(11, { timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await openTab(page, 'Assignments');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2, { timeout: 15000 }); // Jane
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);

    await page.goto('/admin/roles/new');
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible({
      timeout: 15000,
    });
  });

  test('hides Edit, Assignments, Audit, and the assignment count without their permissions', async ({
    context,
    page,
  }, testInfo) => {
    // `roles-limited` drops role.update, role.activate, role_assignment.view and audit.view.
    await authenticate(context, testInfo, 'roles-limited');
    await openDirectory(page);
    await openRecord(page, 'Teller');

    // The hero and Overview have rendered (Deactivate is still granted), so the absences below
    // are settled, not still loading.
    await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
    await expect(mainText(page, 'Role definition')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Permissions' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Assignments' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveCount(0);
    await expect(mainText(page, 'Active assignments')).toHaveCount(0);
  });

  test.describe('accessibility', () => {
    // Each case scans a dozen pages, a validation state and two drawers after /select-context.
    test.describe.configure({ timeout: 180000 });

    const COMPLIANCE_PATH = `/admin/roles/${ROLE_SCENARIO_IDS.compliance}`;
    const COMPLIANCE_HEADING = /^Compliance, risk/;

    /** A drawer is `position: fixed`, so the page scroll check can't see it overflow (index
     * item 4): at 375 px its own box must hold its content. */
    async function expectDrawerFits(a11yCase: A11yCase, dialog: Locator) {
      if (a11yCase.width >= 768) return;
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }

    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        const scan = async (path: string, heading: string | RegExp) => {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
            timeout: 15000,
          });
          await expectA11yCaseApplied(page, a11yCase);
          await expectNoSeriousOrCriticalViolations(page);
        };

        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'roles');
        await openDirectory(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);

        await scan('/admin/roles/new', 'Create role');
        // The validation state is its own surface: the error summary and the field errors.
        await page.getByRole('button', { name: 'Create role' }).click();
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
          'Check Role code, Role name.',
        );
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);

        // The edit form's read-only code field is its own surface.
        await scan(`/admin/roles/${ROLE_SCENARIO_IDS.teller}/edit`, 'Teller');
        await scan(
          `/admin/roles/${ROLE_SCENARIO_IDS.opsSupervisor}/permissions`,
          'Operations supervisor',
        );
        await scan(`/admin/roles/${ROLE_SCENARIO_IDS.teller}/assignments`, 'Teller');

        // The long-named role on every tab; its drawers carry the name in their description.
        await scan(COMPLIANCE_PATH, COMPLIANCE_HEADING);
        await scan(`${COMPLIANCE_PATH}/permissions`, COMPLIANCE_HEADING);
        await page.getByRole('button', { name: 'Grant permissions' }).click();
        const grant = page.getByRole('dialog', { name: 'Grant permissions' });
        await expect(grant).toBeVisible();
        await expectNoSeriousOrCriticalViolations(page);
        await expectDrawerFits(a11yCase, grant);
        await page.keyboard.press('Escape');
        await expect(grant).toBeHidden();

        await scan(`${COMPLIANCE_PATH}/assignments`, COMPLIANCE_HEADING);
        await page.getByRole('button', { name: 'Assign role' }).click();
        const assign = page.getByRole('dialog', { name: 'Assign this role' });
        await expect(assign).toBeVisible();
        await expectNoSeriousOrCriticalViolations(page);
        await expectDrawerFits(a11yCase, assign);
        await page.keyboard.press('Escape');
        await expect(assign).toBeHidden();

        await scan(`${COMPLIANCE_PATH}/audit`, COMPLIANCE_HEADING);
      });
    }
  });
});
