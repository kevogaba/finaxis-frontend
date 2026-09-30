import { expect, test, type Page } from '@playwright/test';
import { IDS } from './fake-api/scenarios.mts';
import { enterAdmin } from './support/admin';
import { addCookie, authenticate, CONTEXT_COOKIE_NAME, selectMuiOption } from './support/auth';

const main = (page: Page) => page.getByRole('main');
const tab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('tab', { name, exact: true });

test.describe('profile', () => {
  // /profile and its tabs can be the first hit of their route tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });

  test('overview: identity, active context, membership, and sign-in time', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterAdmin(page, '/profile', { heading: 'My profile' });

    await expect(
      main(page).getByText('Backend Jane Manager · backend.jane@greenfield.example'),
    ).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');

    const identity = main(page).getByRole('region', { name: 'Identity' });
    await expect(identity.getByText('55555555')).toHaveAttribute('title', IDS.jane);
    // The E2E session was created at 2026-07-26T00:00Z; Greenfield is Africa/Nairobi (UTC+3).
    await expect(identity.getByText('26 Jul 2026 · 03:00 (Africa/Nairobi)')).toBeVisible();

    const active = main(page).getByRole('region', { name: 'Active context' });
    await expect(active.getByText('Greenfield SACCO')).toBeVisible();
    await expect(active.getByText('greenfield', { exact: true })).toBeVisible();
    await expect(active.getByText('Head Office')).toBeVisible();
  });

  test('sends a stale context on a nested tab through context selection and back to that tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await addCookie(context, testInfo, CONTEXT_COOKIE_NAME, 'stale-context-token');

    await page.goto('/profile/contexts');
    await expect(page).toHaveURL(/\/select-context\?next=%2Fprofile%2Fcontexts$/, {
      timeout: 20000,
    });
    await selectMuiOption(page, 'Organisation', /Greenfield/);
    await selectMuiOption(page, 'Branch', /Head Office/);

    await expect(page).toHaveURL((url) => url.pathname === '/profile/contexts', { timeout: 15000 });
    await expect(tab(page, 'Contexts')).toHaveAttribute('aria-current', 'page');
  });

  test('contexts: lists organisations and branches, and switches branch without leaving the tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'multi-org');
    await enterAdmin(page, '/profile/contexts', { heading: 'My profile' });

    const organisations = main(page).getByRole('table', { name: 'Organisations' });
    await expect(organisations.getByRole('row', { name: /Greenfield SACCO/ })).toContainText(
      'Current',
    );
    await expect(organisations.getByRole('row', { name: /Platform/ })).not.toContainText('Current');
    const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
    await expect(branches.getByRole('row', { name: /Head Office/ })).toContainText('Current');

    await main(page).getByRole('button', { name: 'Switch context' }).click();
    const dialog = page.getByRole('dialog', { name: /switch working context/i });
    // First hit of the run's /api/context/organisations route handler (a cold `next dev` compile).
    await expect(dialog.getByRole('combobox', { name: 'Organisation' })).toBeVisible({
      timeout: 20000,
    });
    await dialog.getByRole('combobox', { name: 'Organisation' }).click();
    await page.getByRole('option', { name: /Greenfield/ }).click();
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: /Westlands/ }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: /Switched to Greenfield SACCO/ }),
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/profile/contexts');
    await expect(branches.getByRole('row', { name: /Westlands Branch/ })).toContainText('Current', {
      timeout: 15000,
    });
    await expect(branches.getByRole('row', { name: /Head Office/ })).not.toContainText('Current');
  });

  test('contexts: one row per branch even when the backend repeats it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'duplicate-assignments');
    // One distinct branch: context selection auto-pins it, so there's no branch step.
    await enterAdmin(page, '/profile/contexts', { heading: 'My profile', branch: null });

    const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
    await expect(branches.getByRole('row', { name: /Head Office/ })).toHaveCount(1);
  });

  test('contexts: a suspended branch assignment is listed as suspended', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'suspended-branch');
    // Westlands is SUSPENDED, so Head Office is the only selectable branch and gets auto-pinned.
    await enterAdmin(page, '/profile/contexts', { heading: 'My profile', branch: null });

    const branches = main(page).getByRole('table', { name: 'Branches in Greenfield SACCO' });
    await expect(branches.getByRole('row', { name: /Westlands Branch/ })).toContainText(
      'Suspended',
    );
  });

  test('roles & permissions: one row per role, a disabled role, and permissions grouped by prefix', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'profile-roles');
    await enterAdmin(page, '/profile/roles', { heading: 'My profile' });

    const roles = main(page).getByRole('table', { name: 'Roles' });
    await expect(roles.getByRole('row', { name: /Tenant admin/ })).toHaveCount(1);
    await expect(roles.getByRole('row', { name: /Legacy teller/ })).toContainText('Disabled');

    // Presence only: later layers grow TENANT_ADMIN_PERMISSIONS, so never count codes or groups.
    const permissions = main(page).getByRole('region', { name: 'Effective permissions' });
    await expect(
      permissions.getByRole('list', { name: 'Audit' }).getByText('audit.view', { exact: true }),
    ).toBeVisible();
    await expect(permissions.getByRole('heading', { level: 3, name: 'IAM' })).toBeVisible();
    await expect(permissions.getByText('user.suspend', { exact: true })).toHaveCount(0);
  });

  test('security: opens the Keycloak account console in a new tab', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterAdmin(page, '/profile/security', { heading: 'My profile' });

    const accountLink = main(page).getByRole('link', { name: /Open account console/ });
    // CI's issuer is http://localhost:8080/realms/finaxis; .env.local's differs — match the suffix.
    await expect(accountLink).toHaveAttribute('href', /\/account$/);
    await expect(accountLink).toHaveAttribute('target', '_blank');
    await expect(accountLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
