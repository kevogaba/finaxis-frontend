import { expect, test } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate } from './support/auth';

test.describe('admin E2E helpers', () => {
  // Institution-level /admin/audit can be the first hit of its route tree under `next dev`.
  test.describe.configure({ timeout: 90000 });

  test('enter the audit trail at All branches, dark at 375 px, with no serious a11y violations', async ({
    context,
    page,
  }, testInfo) => {
    const darkNarrow = A11Y_CASES.find(
      (a11yCase) => a11yCase.colorScheme === 'dark' && a11yCase.width === 375,
    );
    if (!darkNarrow) throw new Error('A11Y_CASES lost its dark 375 px case');

    await applyA11yCase(page, darkNarrow);
    await authenticate(context, testInfo);
    await enterAdmin(page, '/admin/audit', {
      heading: 'Audit trail',
      branch: /All branches \(institution level\)/,
    });

    await expectA11yCaseApplied(page, darkNarrow);
    await expect(page.getByText('30 events')).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
