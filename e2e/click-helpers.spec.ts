import { expect, test, type Page } from '@playwright/test';
import { clickInMuiPopover, clickMuiOption } from './support/auth';

// The click helpers' own checks (e2e/support/auth.ts), on a static page: no sign-in and no fake
// API, the one spec without them (AGENTS.md). A real MUI menu can't be made to lose a click on
// demand, so each case builds the condition a helper guards against: a popup that is still
// animating, or a click that leaves its menu open.

/** A popup (`role`) named "Role" holding one item, "Teller". `animation` runs on the popup when it
 * opens (as MUI's Grow does); a click on the item records whether the popup was still animating,
 * then closes it unless `keepOpen`. */
async function showPopup(
  page: Page,
  options: {
    role: 'listbox' | 'dialog';
    animation?: { duration: number; iterations: number };
    keepOpen?: boolean;
  },
) {
  const item =
    options.role === 'listbox'
      ? '<li role="option" aria-selected="false">Teller</li>'
      : '<button type="button">Teller</button>';
  const tag = options.role === 'listbox' ? 'ul' : 'div';
  await page.setContent(
    `<span id="label">Role</span><${tag} id="popup" role="${options.role}" aria-labelledby="label">${item}</${tag}>`,
  );
  await page.evaluate(({ animation, keepOpen }) => {
    const popup = document.getElementById('popup');
    if (!popup) throw new Error('no popup');
    if (animation) {
      // Opacity only: the box never moves, so Playwright's own stability check doesn't wait.
      popup.animate([{ opacity: 0 }, { opacity: 1 }], animation);
    }
    popup.firstElementChild?.addEventListener('click', () => {
      document.body.dataset.clickedWhileAnimating = String(
        popup.getAnimations().some((running) => running.playState === 'running'),
      );
      if (!keepOpen) popup.remove();
    });
  }, options);
}

const clickedWhileAnimating = (page: Page) =>
  page.evaluate(() => document.body.dataset.clickedWhileAnimating);

test.describe('e2e click helpers', () => {
  test('clickMuiOption clicks an option only once its menu has finished animating', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', animation: { duration: 1000, iterations: 1 } });
    await clickMuiOption(page.getByRole('option', { name: 'Teller' }));
    expect(await clickedWhileAnimating(page)).toBe('false');
  });

  test('clickMuiOption fails, naming the menu and the option, when the click leaves the menu open', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', keepOpen: true });
    await expect(clickMuiOption(page.getByRole('option', { name: 'Teller' }))).rejects.toThrow(
      'The "Role" menu stayed open after the click on "Teller", so nothing was chosen.',
    );
  });

  test('clickMuiOption refuses to click a menu still animating after its bound', async ({
    page,
  }) => {
    await showPopup(page, { role: 'listbox', animation: { duration: 60000, iterations: 1 } });
    await expect(clickMuiOption(page.getByRole('option', { name: 'Teller' }))).rejects.toThrow(
      'The "Role" menu was still animating 5 s after it opened, so the click on "Teller" was not sent.',
    );
    expect(await clickedWhileAnimating(page)).toBeUndefined();
  });

  test('clickMuiOption does not wait on an endless animation', async ({ page }) => {
    await showPopup(page, {
      role: 'listbox',
      animation: { duration: 1000, iterations: Infinity },
    });
    const started = Date.now();
    await clickMuiOption(page.getByRole('option', { name: 'Teller' }));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(await clickedWhileAnimating(page)).toBe('true');
  });

  test('clickInMuiPopover clicks inside a popover only once it has finished animating', async ({
    page,
  }) => {
    await showPopup(page, { role: 'dialog', animation: { duration: 1000, iterations: 1 } });
    await clickInMuiPopover(page.getByRole('button', { name: 'Teller' }));
    expect(await clickedWhileAnimating(page)).toBe('false');
  });
});
