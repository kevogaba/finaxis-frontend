import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { addCookie, authenticate, CONTEXT_COOKIE_NAME, selectMuiOption } from './support/auth';
import { IDS, TENANT_SCENARIO_IDS } from './fake-api/scenarios.mts';

async function openDirectory(page: Page) {
  // The platform operator has one branch, which selection picks by itself.
  await enterAdmin(page, '/platform-admin/tenants', {
    heading: 'SACCO institutions',
    organisation: /Platform/,
    branch: null,
  });
}

async function openRecord(page: Page, name: string) {
  await page
    .getByRole('table', { name: 'Institutions' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

// Scoped to `main`, as in branches.spec.ts: a streamed route can briefly exist as a hidden
// duplicate segment, and `getByRole('main')` resolves only the rendered one.
const mainText = (page: Page, value: string | RegExp, options?: { exact?: boolean }) =>
  page.getByRole('main').getByText(value, options);
// The hero chip and the Overview's Lifecycle row both show the status: `.first()` is load-bearing.
const statusChip = (page: Page, value: string) => mainText(page, value, { exact: true }).first();
const rowsOf = (page: Page) => page.getByRole('table', { name: 'Institutions' }).getByRole('row');
// Reject and Deprovision are alertdialogs once ReasonDialog has 08's V3 tone; the rest are dialogs.
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
// Not-found renders `app/not-found.tsx`. The layout's `notFound()` answers HTTP 200 behind the root
// loading boundary (as in 08 and 09), so a missing page is asserted by its content, never by
// `response.status()`.
const notFoundHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: "We couldn't find that page" });

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

/** The focused control's room above the wizard's sticky action bar and below the sticky app bar. A
 * control closer than 0 is under a bar and, for keyboard users, hidden (WCAG 2.4.11). */
async function focusClearance(page: Page) {
  // A frame after the key press: the browser has scrolled the focused control into view.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  return page.evaluate(() => {
    const focused = document.activeElement;
    const actionBar = document.querySelector('form button[type="submit"]')?.parentElement;
    const form = actionBar?.closest('form');
    const appBar = document.querySelector('header');
    if (!focused || !actionBar || !form || !appBar) return null;
    const rect = focused.getBoundingClientRect();
    const labelled = focused as HTMLInputElement;
    return {
      name:
        focused.getAttribute('aria-label') ??
        labelled.labels?.[0]?.textContent ??
        focused.textContent.trim().slice(0, 40),
      inForm: form.contains(focused),
      inActionBar: actionBar.contains(focused),
      belowAppBar: rect.top - appBar.getBoundingClientRect().bottom,
      aboveActionBar: actionBar.getBoundingClientRect().top - rect.bottom,
    };
  });
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

/** After a `goto`, a client handler works only once React has hydrated the node (selectMuiOption's
 * poll, for a control that isn't a Select). */
async function hydrated(locator: Locator) {
  await expect
    .poll(
      () => locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps'))),
      { timeout: 20000 },
    )
    .toBe(true);
}

test.describe('platform tenants', () => {
  // Every route here can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });

  test('lists the institutions without the platform organisation, and filters and sorts them through the URL', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);

    // BG-29: eight organisations, seven institutions.
    await expect(mainText(page, '7 institutions')).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(8); // header + 7
    await expect(rowsOf(page).nth(1)).toContainText('Umoja Teachers SACCO');
    await expect(rowsOf(page).filter({ hasText: 'PLATFORM' })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Search' }).fill('pwani');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page).toHaveURL(/q=pwani/, { timeout: 15000 });
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(mainText(page, '1 institution', { exact: true })).toBeVisible();

    // Wait for each cleared render (as branches.spec does): the next push builds on it.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Country', /^Uganda$/);
    await expect(page).toHaveURL(/country=UG/, { timeout: 15000 });
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(rowsOf(page).nth(1)).toContainText('Harambee Farmers SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expect(page).toHaveURL(/status=SUSPENDED/, { timeout: 15000 });
    await expect(rowsOf(page).nth(1)).toContainText('Kilimo Bora SACCO');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
    const byName = page.getByRole('columnheader', { name: 'Institution', exact: true });
    await byName.getByRole('link').click();
    await expect(page).toHaveURL(/sortBy=displayName&sortDir=ASC/, { timeout: 15000 });
    await expect(byName).toHaveAttribute('aria-sort', 'ascending');
    await expect(rowsOf(page).nth(1)).toContainText('Acme SACCO');
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
      const from = page.getByLabel('Created from', { exact: true });
      await hydrated(from);
      await from.fill('2026-08-15T00:00');
      await from.press('Enter');
      await expect(page).toHaveURL(
        (url) => url.searchParams.get('createdFrom') === '2026-08-15T00:00:00.000Z',
        { timeout: 15000 },
      );
      await expect(mainText(page, '4 institutions')).toBeVisible({ timeout: 15000 });
      await expect(rowsOf(page)).toHaveCount(5); // header + 4
      await expect(rowsOf(page).nth(1)).toContainText('Umoja Teachers SACCO');
      await expect(rowsOf(page).nth(4)).toContainText('Pwani Fishermen SACCO');
      await expect(rowsOf(page).filter({ hasText: 'Kilimo Bora SACCO' })).toHaveCount(0);

      // Created to commits on blur (Tab only moves between the field's own segments) and stores
      // the chosen minute's last millisecond.
      const to = page.getByLabel('Created to', { exact: true });
      await to.fill('2026-09-03T08:00');
      await to.blur();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get('createdFrom') === '2026-08-15T00:00:00.000Z' &&
          url.searchParams.get('createdTo') === '2026-09-03T08:00:59.999Z',
        { timeout: 15000 },
      );
      await expect(mainText(page, '2 institutions')).toBeVisible({ timeout: 15000 });
      await expect(rowsOf(page)).toHaveCount(3); // header + 2
      await expect(rowsOf(page).nth(1)).toContainText('Mwangaza Savings SACCO');
      await expect(rowsOf(page).nth(2)).toContainText('Pwani Fishermen SACCO');

      // Both fields show what the URL holds after the render, and Clear filters empties them.
      await expect(page.getByLabel('Created from', { exact: true })).toHaveValue(
        '2026-08-15T00:00',
      );
      await expect(page.getByLabel('Created to', { exact: true })).toHaveValue('2026-09-03T08:00');
      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(mainText(page, '7 institutions')).toBeVisible({ timeout: 15000 });
      await expect(page).toHaveURL(
        (url) => !url.searchParams.has('createdFrom') && !url.searchParams.has('createdTo'),
      );
      await expect(page.getByLabel('Created from', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Created to', { exact: true })).toHaveValue('');
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
      await expect(notFoundHeading(page), path).toBeVisible({ timeout: 15000 });
      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    }
  });

  test('creates a draft, refusing a taken code before the create call, then explains the maker-checker refusal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await page.getByRole('link', { name: 'Create tenant draft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create tenant draft' })).toBeVisible({
      timeout: 15000,
    });

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

    // BG-07: the code is checked before the POST, and the wizard returns to its step.
    await expect(page.getByRole('heading', { level: 2, name: 'Institution' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, 'This code is already in use.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toBeFocused();

    await page.getByRole('textbox', { name: 'Tenant code' }).fill('tujenge-traders');
    await next(page, 'First administrator');
    await next(page, 'Initial settings');
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/platform-admin\/tenants\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tujenge Traders SACCO' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();

    await expect(await act(page, 'Submit for approval')).toBeHidden();
    await expect(statusChip(page, 'Pending approval')).toBeVisible({ timeout: 15000 });
    // Jane created and submitted it, so the platform refuses her approval (BG-08).
    const refused = await act(page, 'Approve');
    await expect(refused.getByRole('alert')).toContainText('created or submitted the request');
  });

  test('approves a request another administrator submitted, and shows provisioning queued', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Harambee Farmers SACCO');

    await expect(await act(page, 'Approve')).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Approved. Provisioning is queued.' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Active')).toBeVisible();
    // ACTIVE offers Suspend first, so focus lands there (standing ruling 4).
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();

    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
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
    await openRecord(page, 'Mwangaza Savings SACCO');

    await expect(await act(page, 'Reject', 'Duplicate of another request')).toBeHidden();
    // REJECTED offers nothing, so the actions unmount and their cleanup focuses the title.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mwangaza Savings SACCO' }),
    ).toBeFocused();
    await expect(statusChip(page, 'Rejected')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Approve|Reject)$/ })).toHaveCount(0);
  });

  test('suspends an institution with a reason and reactivates it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Acme SACCO');

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
    await openRecord(page, 'Kilimo Bora SACCO');

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
    await openRecord(page, 'Pwani Fishermen SACCO');
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
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

  test('amends a draft as a full replacement, re-entering what the platform cannot return (BG-14)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await openDirectory(page);
    await openRecord(page, 'Umoja Teachers SACCO');

    await page.getByRole('link', { name: 'Amend draft' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Amend Umoja Teachers SACCO' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveAttribute(
      'readonly',
      '',
    );
    await page
      .getByRole('textbox', { name: 'Display name' })
      .fill('Umoja Teachers Co-operative SACCO');
    await page
      .getByRole('textbox', { name: 'Legal name' })
      .fill('Umoja Teachers Co-operative Society Ltd');
    await next(page, 'First administrator');
    await fillAdministrator(page);
    await next(page, 'Review');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/platform-admin/tenants/${TENANT_SCENARIO_IDS.umoja}$`),
      { timeout: 15000 },
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Umoja Teachers Co-operative SACCO' }),
    ).toBeVisible();
    await expect(statusChip(page, 'Draft')).toBeVisible();
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
    ).toBeVisible({ timeout: 15000 });
    await expect(mainText(page, 'Only a draft can be amended', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to the record' }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}`,
      {
        timeout: 15000,
      },
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('sends a stale platform context to context selection and back to the same tab (index item 1)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-tenants');
    await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');
    const tab = `/platform-admin/tenants/${TENANT_SCENARIO_IDS.pwani}/provisioning`;

    await page.goto(tab);
    await expect(page).toHaveURL(/\/select-context\?next=/, { timeout: 20000 });
    await selectMuiOption(page, 'Organisation', /Platform/);
    await expect(page).toHaveURL((url) => url.pathname === tab, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pwani Fishermen SACCO' }),
    ).toBeVisible({ timeout: 15000 });
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
    await openRecord(page, 'Acme SACCO');
    await expect(page.getByRole('button', { name: /^(Suspend|Deprovision)$/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Provisioning' }).click();
    await expect(page).toHaveURL(/\/provisioning$/, { timeout: 15000 });
    await expect(page.getByRole('list', { name: 'Provisioning steps' })).toBeVisible();

    await page.goto('/platform-admin/tenants/new');
    await expect(page.getByRole('main').getByText("You don't have permission")).toBeVisible({
      timeout: 15000,
    });

    // Acme is ACTIVE, so were the permission check dropped this page would say "Only a draft can be
    // amended" instead: the forbidden state proves tenant.update_draft is checked first.
    await page.goto(`/platform-admin/tenants/${IDS.acme}/amend`);
    await expect(page.getByRole('heading', { level: 1, name: 'Amend Acme SACCO' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, "You don't have permission")).toBeVisible();
    await expect(mainText(page, 'Only a draft can be amended')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Tenant code' })).toHaveCount(0);
    // No form follows, so no form instructions; the way back is the same as the draft guard's.
    await expect(mainText(page, /so enter them again/)).toHaveCount(0);
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
      ).toBeVisible({
        timeout: 15000,
      });
      await hydrated(page.getByRole('button', { name: 'Continue' }));
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
      test.setTimeout(120000);
      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'platform-tenants');
      await openDirectory(page);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      await page.goto('/platform-admin/tenants/new');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Create tenant draft' }),
      ).toBeVisible({ timeout: 15000 });
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);
      // The error summary and the invalid fields; Continue is a client handler.
      const proceed = page.getByRole('button', { name: 'Continue' });
      await hydrated(proceed);
      await proceed.click();
      await expect(mainText(page, /^Check these fields/)).toBeVisible();
      await expectNoSeriousOrCriticalViolations(page);

      for (const [path, heading] of [
        // The 100-character name: hero, tabs and Overview never scroll the page (index item 4).
        [`/platform-admin/tenants/${TENANT_SCENARIO_IDS.nairobiMetro}`, /^Nairobi Metropolitan/],
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
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }

      // Acme is ACTIVE: the CRITICAL deprovision dialog, open.
      const deprovision = page.getByRole('button', { name: 'Deprovision', exact: true });
      await hydrated(deprovision);
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
