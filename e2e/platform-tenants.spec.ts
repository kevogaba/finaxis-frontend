import { expect, test, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  notFoundHeading,
  openRecord,
  rowsOf,
  statusChip,
  focusClearance,
} from './support/admin';
import {
  addCookie,
  authenticate,
  CONTEXT_COOKIE_NAME,
  expectHydrated,
  selectMuiOption,
} from './support/auth';
import { IDS, LONG_RETURN_REASON, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

async function openDirectory(page: Page) {
  // The platform operator has one branch, which selection picks by itself.
  await enterAdmin(page, '/platform-admin/tenants', {
    heading: 'SACCO institutions',
    organisation: /Platform/,
    branch: null,
  });
}

// Reject and Deprovision are alertdialogs once ReasonDialog has 08's V3 tone; the rest are dialogs.
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
// The app's copy, repeated: Playwright can't resolve the app's `@/` imports.
const TENANT_MAKER_BLOCKED =
  'You requested or submitted this institution, so another platform administrator must decide it.';
const DECISIONS = ['Approve', 'Return for changes', 'Reject'];

/** The Overview's value for a label (its `dd`). */
const fact = (page: Page, label: string) =>
  page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');

/** A returned draft's note on the Overview (BG-01). */
const returnedNote = (page: Page) =>
  page.getByRole('main').getByRole('note').filter({ hasText: 'Returned for changes.' });

/** A hero lifecycle action through its dialog; the caller asserts the outcome. */
async function act(page: Page, label: string, reason?: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = dialogOf(page);
  if (reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** A wizard Autocomplete: filter by the option's label, then choose it. */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).fill(option);
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Continue, then wait for the next step's heading. */
async function next(page: Page, step: string) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible();
}

async function fillAdministrator(page: Page) {
  await page.getByRole('textbox', { name: 'Email' }).fill('amina@tujenge.example');
  await page.getByRole('textbox', { name: 'Username' }).fill('amina.otieno');
  await page.getByRole('textbox', { name: 'Full name' }).fill('Amina Otieno');
  await page.getByRole('textbox', { name: 'Phone' }).fill('+254712000140');
}

/** Tabs from a step's heading to the action bar, then Shift+Tabs back out of the form: every stop
 * clears both sticky bars, and the walk covers at least `minimum` stops. */
async function expectFocusStopsClearTheBars(page: Page, step: string, minimum: number) {
  await page.getByRole('heading', { level: 2, name: step }).focus();
  let stops = 0;
  for (let press = 0; press < 25; press++) {
    await page.keyboard.press('Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm || stop.inActionBar) break;
    stops++;
    expect(
      stop.aboveActionBar,
      `Tab stop "${stop.name}" is under the action bar`,
    ).toBeGreaterThanOrEqual(0);
  }
  expect(stops).toBeGreaterThanOrEqual(minimum);

  // Backwards, out of the form: the shell's app bar must not cover a stop either.
  for (let press = 0; press < 40; press++) {
    await page.keyboard.press('Shift+Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm) break;
    if (stop.inActionBar) continue;
    expect(
      stop.belowAppBar,
      `Shift+Tab stop "${stop.name}" is under the app bar`,
    ).toBeGreaterThanOrEqual(0);
  }
}

test.describe('platform tenants', () => {
  test('lists the institutions without the platform organisation, and filters and sorts them through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);

    // BG-29: eight organisations, seven institutions.
    await expect(mainText(page, '7 institutions')).toBeVisible();
    await expect(rowsOf(page, 'Institutions')).toHaveCount(8); // header + 7
    await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Umoja Teachers SACCO');
    await expect(rowsOf(page, 'Institutions').filter({ hasText: 'PLATFORM' })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Search' }).fill('pwani');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=pwani/);
    await expect(rowsOf(page, 'Institutions')).toHaveCount(2);
    await expect(mainText(page, '1 institution', { exact: true })).toBeVisible();

    // Wait for each cleared render (as branches.spec does): the next push builds on it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible();
    await selectMuiOption(page, 'Country', /^Uganda$/);
    await expect(page).toHaveURL(/country=UG/);
    await expect(rowsOf(page, 'Institutions')).toHaveCount(2);
    await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Harambee Farmers SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible();
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expect(page).toHaveURL(/status=SUSPENDED/);
    await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Kilimo Bora SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible();
    const byName = page.getByRole('columnheader', { name: 'Institution', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=displayName&sortDir=ASC/);
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Acme SACCO');
  });

  test.describe('created filters', () => {
    // The fields take local time, so the instants in the URL are asserted exactly under UTC.
    test.use({ timezoneId: 'UTC' });

    test('narrows the directory by Created from and Created to, through the toolbar and the URL', async ({
      context,
      page,
    }, testInfo) => {
      await authenticate(context, testInfo, 'platform-tenants');
      await openDirectory(page);
      await expect(mainText(page, '7 institutions')).toBeVisible();

      // Seeded createdAt (08:00 UTC): Umoja 5 Sep, Harambee 4 Sep, Mwangaza 3 Sep, Pwani 20 Aug,
      // Kilimo 10 Aug, Nairobi Metropolitan 1 Aug, Acme 1 Jul.
      const from = page.getByRole('main').getByLabel('Created from', { exact: true });
      await expectHydrated(from);
      await from.fill('2026-08-15T00:00');
      await from.press('Enter');
      await expect(page).toHaveURL(
        (url) => url.searchParams.get('createdFrom') === '2026-08-15T00:00:00.000Z',
      );
      await expect(mainText(page, '4 institutions')).toBeVisible();
      await expect(rowsOf(page, 'Institutions')).toHaveCount(5); // header + 4
      await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Umoja Teachers SACCO');
      await expect(rowsOf(page, 'Institutions').nth(4)).toContainText('Pwani Fishermen SACCO');
      await expect(
        rowsOf(page, 'Institutions').filter({ hasText: 'Kilimo Bora SACCO' }),
      ).toHaveCount(0);

      // Created to commits on blur (Tab only moves between the field's own segments) and stores
      // the chosen minute's last millisecond.
      const to = page.getByRole('main').getByLabel('Created to', { exact: true });
      await to.fill('2026-09-03T08:00');
      await to.blur();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get('createdFrom') === '2026-08-15T00:00:00.000Z' &&
          url.searchParams.get('createdTo') === '2026-09-03T08:00:59.999Z',
      );
      await expect(mainText(page, '2 institutions')).toBeVisible();
      await expect(rowsOf(page, 'Institutions')).toHaveCount(3); // header + 2
      await expect(rowsOf(page, 'Institutions').nth(1)).toContainText('Mwangaza Savings SACCO');
      await expect(rowsOf(page, 'Institutions').nth(2)).toContainText('Pwani Fishermen SACCO');

      // Both fields show what the URL holds after the render, and Clear filters empties them.
      await expect(page.getByRole('main').getByLabel('Created from', { exact: true })).toHaveValue(
        '2026-08-15T00:00',
      );
      await expect(page.getByRole('main').getByLabel('Created to', { exact: true })).toHaveValue(
        '2026-09-03T08:00',
      );
      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(mainText(page, '7 institutions')).toBeVisible();
      await expect(page).toHaveURL(
        (url) => !url.searchParams.has('createdFrom') && !url.searchParams.has('createdTo'),
      );
      await expect(page.getByRole('main').getByLabel('Created from', { exact: true })).toHaveValue(
        '',
      );
      await expect(page.getByRole('main').getByLabel('Created to', { exact: true })).toHaveValue(
        '',
      );
    });
  });

  test('answers a missing, reserved or malformed institution with the not-found page', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);

    // The reserved platform organisation is no institution, so neither its record nor its tabs nor
    // its amend page exist (BG-29); a malformed id never reaches the backend; an unknown one is
    // the backend's own 404.
    for (const path of [
      `/platform-admin/tenants/${IDS.platformOrganisation}`,
      `/platform-admin/tenants/${IDS.platformOrganisation}/provisioning`,
      `/platform-admin/tenants/${IDS.platformOrganisation}/amend`,
      '/platform-admin/tenants/not-a-uuid',
      '/platform-admin/tenants/not-a-uuid/amend',
      '/platform-admin/tenants/16000000-0000-4000-8000-0000000000ff',
      '/platform-admin/tenants/16000000-0000-4000-8000-0000000000ff/amend',
    ]) {
      await page.goto(path);
      await expect(notFoundHeading(page), path).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    }
  });

  test('creates a draft, naming a taken code after the create fails, then withholds its own decision', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await page.getByRole('link', { name: 'Create tenant draft' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create tenant draft' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      mainText(
        page,
        'Check these fields: Tenant code, Display name, Country, Base currency, Timezone.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toBeFocused();

    await page.getByRole('textbox', { name: 'Tenant code' }).fill('acme');
    await page.getByRole('textbox', { name: 'Display name' }).fill('Tujenge Traders SACCO');
    await pick(page, 'Country', 'Kenya');
    await pick(page, 'Base currency', 'KES · Kenyan Shilling');
    await pick(page, 'Timezone', 'Africa/Nairobi');
    await next(page, 'First administrator');
    await fillAdministrator(page);
    await next(page, 'Initial settings');
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Create draft' }).click();

    // BG-07: the create fails with the generic 409, the directory confirms the code, and the
    // wizard returns to its step.
    await expect(page.getByRole('heading', { level: 2, name: 'Institution' })).toBeVisible();
    await expect(mainText(page, 'This code is already in use.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toBeFocused();

    await page.getByRole('textbox', { name: 'Tenant code' }).fill('tujenge-traders');
    await next(page, 'First administrator');
    await next(page, 'Initial settings');
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/platform-admin\/tenants\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tujenge Traders SACCO' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();

    await expect(await act(page, 'Submit for approval')).toBeHidden();
    await expect(statusChip(page, 'Pending approval')).toBeVisible();
    // Jane requested and submitted it (the record's makers, BG-08), so no decision is hers; all
    // are disabled, so focus falls back to the title.
    for (const name of DECISIONS) {
      const decision = page.getByRole('button', { name, exact: true });
      await expect(decision).toBeDisabled();
      await expect(decision).toHaveAccessibleDescription(TENANT_MAKER_BLOCKED);
    }
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tujenge Traders SACCO' }),
    ).toBeFocused();
  });

  test('approves a request another administrator submitted with a remark, and shows provisioning queued', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Institutions', 'Harambee Farmers SACCO');

    // Decision Q7 (BG-01): an optional remark, which becomes the institution's status reason.
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Approve Harambee Farmers SACCO?' });
    const remark = dialog.getByRole('textbox', { name: 'Remark (optional)' });
    await expect(remark).toHaveAccessibleDescription(
      'Recorded with the approval. Up to 500 characters.',
    );
    await remark.fill('KYC pack reviewed');
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Approved. Provisioning is queued.' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Active')).toBeVisible();
    // ACTIVE offers Suspend first, so focus lands there (standing ruling 4).
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();

    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/);
    const steps = page.getByRole('list', { name: 'Provisioning steps' }).getByRole('listitem');
    await expect(steps.nth(2)).toContainText('Done');
    await expect(steps.nth(3)).toContainText('In progress');
  });

  test('rejects a pending request with a required reason, leaving no action', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    // Another operator requested and submitted Harambee, so Jane may decide it.
    await openRecord(page, 'Institutions', 'Harambee Farmers SACCO');

    await expect(await act(page, 'Reject', 'Duplicate of another request')).toBeHidden();
    // REJECTED offers nothing, so the actions unmount and their cleanup focuses the title.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Harambee Farmers SACCO' }),
    ).toBeFocused();
    await expect(statusChip(page, 'Rejected')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);
  });

  test('disables Approve, Return for changes and Reject for its submitter, naming both makers (BG-08)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    // Jane submitted Mwangaza; its requester has no account the platform can name.
    await openRecord(page, 'Institutions', 'Mwangaza Savings SACCO');

    for (const name of DECISIONS) {
      const decision = page.getByRole('button', { name, exact: true });
      await expect(decision).toBeDisabled();
      await expect(decision).toHaveAccessibleDescription(TENANT_MAKER_BLOCKED);
    }
    await expect(mainText(page, TENANT_MAKER_BLOCKED)).toBeVisible();
    await expect(fact(page, 'Requested by')).toHaveText('—');
    await expect(fact(page, 'Submitted by')).toHaveText('You (Backend Jane Manager)');
  });

  // Platform #181 (BG-01), at 375 px with a reason at its 500-character bound (Review Focus 5).
  test('returns a pending request for changes with a reason, which its draft then shows', async ({
    context,
    page,
  }, testInfo) => {
    const narrow = A11Y_CASES[1];
    expect(narrow.width).toBe(375);
    await applyA11yCase(page, narrow);
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    // Another operator requested and submitted Harambee, so Jane may return it.
    await openRecord(page, 'Institutions', 'Harambee Farmers SACCO');
    await expect(fact(page, 'Legal name')).toHaveText(
      'Harambee Farmers Savings and Credit Co-operative Society Ltd',
    );
    await expect(fact(page, 'Registration number')).toHaveText('CS/2018/0117');

    await page.getByRole('button', { name: 'Return for changes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Return Harambee Farmers SACCO for changes?' });
    await expect(dialog).toHaveAccessibleDescription(
      'It goes back to draft. The requester sees your reason and can amend and resubmit it.',
    );
    const reason = dialog.getByRole('textbox', { name: 'What needs to change' });
    await reason.fill(LONG_RETURN_REASON);
    await expect(reason).toHaveValue(LONG_RETURN_REASON);
    // A dialog is `position: fixed`, so the page-width check can't see it overflow. The reason
    // wraps, so the dialog (the role element is MUI's Paper) must also stay inside the viewport,
    // not only hold its content.
    expect(
      await dialog.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return (
          node.scrollWidth <= node.clientWidth && box.left >= 0 && box.right <= window.innerWidth
        );
      }),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Return for changes', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('alert').filter({ hasText: 'Returned for changes' })).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();
    // DRAFT offers Submit first, so focus lands there (standing ruling 4).
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeFocused();
    await expect(
      page.getByRole('button', { name: /^(Approve|Return for changes|Reject)$/ }),
    ).toHaveCount(0);
    await expect(returnedNote(page)).toHaveText(`Returned for changes. ${LONG_RETURN_REASON}`);
    // The returned submission is forgotten: no submitter until the next one.
    await expect(fact(page, 'Submitted by')).toHaveText('—');
    await expectA11yCaseApplied(page, narrow);
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('suspends an institution with a reason and reactivates it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Institutions', 'Acme SACCO');

    await expect(await act(page, 'Suspend', 'Compliance review')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeFocused();
    await expect(statusChip(page, 'Suspended')).toBeVisible();

    await expect(await act(page, 'Reactivate')).toBeHidden();
    await expect(statusChip(page, 'Active')).toBeVisible();
  });

  test('deprovisions only after the tenant code is typed back (CRITICAL)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Institutions', 'Kilimo Bora SACCO');

    await page.getByRole('button', { name: 'Deprovision', exact: true }).click();
    const dialog = page.getByRole('alertdialog'); // CRITICAL: irreversible, so an alertdialog
    const confirm = dialog.getByRole('textbox', { name: 'Type kilimo-bora to confirm' });
    await confirm.fill('kilimo');
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Merged into Harambee');
    await dialog.getByRole('button', { name: 'Deprovision', exact: true }).click();
    await expect(dialog.getByText('Type the tenant code exactly as shown.')).toBeVisible();

    await confirm.fill('kilimo-bora');
    await dialog.getByRole('button', { name: 'Deprovision', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Kilimo Bora SACCO' })).toBeFocused();
    await expect(statusChip(page, 'Deprovisioned')).toBeVisible();
  });

  test('retries a failed bootstrap from the Provisioning tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Institutions', 'Pwani Fishermen SACCO');
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/);
    await expect(mainText(page, 'KEYCLOAK_UNAVAILABLE')).toBeVisible();

    await expect(await act(page, 'Retry bootstrap')).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Bootstrap retry started' }),
    ).toBeVisible();
    // The button leaves with the FAILED state, so its unmount cleanup focuses the title.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeFocused();
    await expect(page.getByRole('button', { name: 'Retry bootstrap' })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Provisioning steps' }).getByRole('listitem').nth(3),
    ).toContainText('In progress');
  });

  test('amends a returned draft from its own values, keeping what it leaves, and resubmits it (BG-14)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    // Seeded as returned for changes, with its legal name and first administrator.
    await openRecord(page, 'Institutions', 'Umoja Teachers SACCO');
    await expect(returnedNote(page)).toBeVisible();

    await page.getByRole('link', { name: 'Amend draft' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Amend Umoja Teachers SACCO' }),
    ).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute(
      'readonly',
      '',
    );
    // Pre-filled from the draft: nothing is asked again.
    await expect(main.getByRole('textbox', { name: 'Legal name' })).toHaveValue(
      'Umoja Teachers Co-operative Society Ltd',
    );
    await main.getByRole('textbox', { name: 'Registration number' }).fill('CS/2019/0042');
    await next(page, 'First administrator');
    await expect(main.getByRole('textbox', { name: 'Email' })).toHaveValue('wanjiku@umoja.example');
    await expect(main.getByRole('textbox', { name: 'Phone' })).toHaveValue('+254712000201');
    await expect(main.getByRole('checkbox', { name: 'Send application invite' })).toBeChecked();
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}$`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Umoja Teachers SACCO' }),
    ).toBeVisible();
    // Only the registration number was sent; the legal name the PATCH left out is kept.
    await expect(fact(page, 'Registration number')).toHaveText('CS/2019/0042');
    await expect(fact(page, 'Legal name')).toHaveText('Umoja Teachers Co-operative Society Ltd');
    // An amend is no transition: the reason stays until the draft is submitted again.
    await expect(returnedNote(page)).toBeVisible();

    await expect(await act(page, 'Submit for approval')).toBeHidden();
    await expect(statusChip(page, 'Pending approval')).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'Returned for changes.' })).toHaveCount(
      0,
    );
    // Jane requested it and has now submitted it, so no decision is hers.
    for (const name of DECISIONS) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
  });

  // A draft with no bootstrap record (a SQL-seeded tenant): the platform keeps no first
  // administrator for it and its amend would discard one, so the wizard asks for none (BG-14).
  test('amends a draft the platform keeps no administrator for, asking for none (BG-14)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants-no-administrator');
    await openDirectory(page);

    await page.goto(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}/amend`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Amend Umoja Teachers SACCO' }),
    ).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Registration number' })
      .fill('CS/2019/0042');
    await next(page, 'First administrator');
    await expect(
      mainText(
        page,
        "The platform keeps no draft administrator for this institution, so there's none to change here.",
      ),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}$`),
    );
    await expect(fact(page, 'Registration number')).toHaveText('CS/2019/0042');
  });

  test('explains that only a draft can be amended, and links back to the record', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);

    // Pwani is ACTIVE: Jane holds tenant.update_draft, so this is the lifecycle guard alone.
    await page.goto(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/amend`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Amend Pwani Fishermen SACCO' }),
    ).toBeVisible();
    await expect(mainText(page, 'Only a draft can be amended', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to the record' }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}`,
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeVisible();
  });

  test('sends a stale platform context to context selection and back to the same tab (index item 1)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');
    const tab = `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/provisioning`;

    await page.goto(tab);
    await expect(page).toHaveURL(/\/select-context\?next=/);
    await selectMuiOption(page, 'Organisation', /Platform/);
    await expect(page).toHaveURL((url) => url.pathname === tab);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Provisioning' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('offers no tenant mutations without the permissions', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-operator'); // tenant.view only
    await openDirectory(page);

    await expect(mainText(page, '1 institution', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create tenant draft' })).toHaveCount(0);
    await openRecord(page, 'Institutions', 'Acme SACCO');
    await expect(page.getByRole('button', { name: /^(Suspend|Deprovision)$/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/);
    await expect(page.getByRole('list', { name: 'Provisioning steps' })).toBeVisible();

    await page.goto('/platform-admin/tenants/new');
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible();

    // Acme is ACTIVE, so were the permission check dropped this page would say "Only a draft can be
    // amended" instead: the forbidden state proves tenant.update_draft is checked first.
    await page.goto(`/platform-admin/tenants/${IDS.acme}/amend`);
    await expect(page.getByRole('heading', { level: 1, name: 'Amend Acme SACCO' })).toBeVisible();
    await expect(mainText(page, "You don't have permission")).toBeVisible();
    await expect(mainText(page, 'Only a draft can be amended')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
    // The way back is the same as the draft guard's.
    await expect(page.getByRole('link', { name: 'Back to the record' })).toHaveAttribute(
      'href',
      `/platform-admin/tenants/${IDS.acme}`,
    );
  });

  // WCAG 2.4.11: the wizard's sticky action bar (and the shell's app bar, going backwards) must not
  // cover the control that has keyboard focus. axe cannot see this; the page's scroll padding fixes it.
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: '375px', width: 375, height: 812 },
  ]) {
    test(`keeps keyboard focus clear of the sticky bars in the wizard (${viewport.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(context, testInfo, 'platform-tenants');
      await openDirectory(page);
      await page.goto('/platform-admin/tenants/new');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Create tenant draft' }),
      ).toBeVisible();
      await expectHydrated(page.getByRole('button', { name: 'Continue' }));
      // Fields keep a readable width on a wide screen, as the branch and role forms do.
      const codeField = await page.getByRole('textbox', { name: 'Tenant code' }).boundingBox();
      expect(codeField?.width).toBeLessThanOrEqual(640);

      // Step 1 ends in the Country combobox, Legal name and the First business date on the way.
      await expectFocusStopsClearTheBars(page, 'Institution', 8);

      await page.getByRole('textbox', { name: 'Tenant code' }).fill('tujenge-traders');
      await page.getByRole('textbox', { name: 'Display name' }).fill('Tujenge Traders SACCO');
      await pick(page, 'Country', 'Kenya');
      await pick(page, 'Base currency', 'KES · Kenyan Shilling');
      await pick(page, 'Timezone', 'Africa/Nairobi');
      await next(page, 'First administrator');
      await fillAdministrator(page);
      await next(page, 'Initial settings');
      await next(page, 'Review');

      // The three Edit buttons, "Edit first administrator" among them.
      await expectFocusStopsClearTheBars(page, 'Review', 3);
    });
  }

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      // Walks every wizard step and the record, scanning each: 14-16 s on the production build at
      // 4 workers on 4 CPUs, so the 30 s default is too close.
      test.setTimeout(60000);
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'platform-tenants');
      await openDirectory(page);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      await page.goto('/platform-admin/tenants/new');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Create tenant draft' }),
      ).toBeVisible();
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);
      // The error summary and the invalid fields; Continue is a client handler.
      const proceed = page.getByRole('button', { name: 'Continue' });
      await expectHydrated(proceed);
      await proceed.click();
      await expect(mainText(page, /^Check these fields/)).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);

      for (const [path, heading] of [
        // The 100-character name: hero, tabs and Overview never scroll the page (index item 4).
        [`/platform-admin/tenants/${TENANT_SCENARIO_IDS.nairobiMetro}`, /^Nairobi Metropolitan/],
        // A returned draft: its 500-character reason wraps inside the note (Review Focus 5).
        [`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}`, 'Umoja Teachers SACCO'],
        [
          `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/provisioning`,
          'Pwani Fishermen SACCO',
        ],
        [
          `/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}/amend`,
          'Amend Umoja Teachers SACCO',
        ],
        // Pwani is ACTIVE: the "Only a draft can be amended" state, with its way back.
        [
          `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/amend`,
          'Amend Pwani Fishermen SACCO',
        ],
        [`/platform-admin/tenants/${IDS.acme}`, 'Acme SACCO'],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }

      // Acme is ACTIVE: the CRITICAL deprovision dialog, open.
      const deprovision = page.getByRole('button', { name: 'Deprovision', exact: true });
      await expectHydrated(deprovision);
      await deprovision.click();
      await expect(dialogOf(page)).toBeVisible();
      // MUI's Fade sets `opacity` on the dialog's transition container, and axe blends ancestor
      // opacity into color-contrast: scanning mid-fade reports a false violation against a
      // half-faded surface (the same wait as settings.spec.ts).
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
      await expectNoSeriousOrCriticalViolations(page);
    });
  }
});
