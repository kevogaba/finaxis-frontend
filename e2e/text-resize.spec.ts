import { expect, test, type Page } from '@playwright/test';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';

// WCAG 1.4.4 (Resize Text): the shell header and the wizard's stepper at 200% text. The root font
// size is raised the way a browser's text-size setting raises it (`rem` doubles, `px` does not), so
// a control sized in `px` around an icon sized in `rem` is what these checks catch.

const ALL_BRANCHES = /All branches \(institution level\)/;

/** A route's first hit compiles under a cold `next dev` (tens of seconds); warm, this resolves at once. */
const FIRST_HIT = 45000;

const WIDTHS = [375, 768, 1440] as const;
const SIZES = ['100%', '200%'] as const;

/** The wizard as the first navigation of a test: it has the shell header and a stepper. */
async function openWizard(page: Page) {
  await page.goto('/admin/users/new');
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', ALL_BRANCHES);
  await expect(page).toHaveURL((url) => url.pathname === '/admin/users/new', {
    timeout: FIRST_HIT,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Invite user' })).toBeVisible({
    timeout: FIRST_HIT,
  });
  await expectHydrated(page.getByRole('button', { name: 'Continue' }));
}

/** What is broken in the header and the stepper right now; `[]` when nothing is. */
async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const header = document.querySelector('header');
    if (!header) return ['no header'];

    const controls = Array.from(
      header.querySelectorAll<HTMLElement>('button, a, [role="combobox"]'),
    ).filter((control) => control.offsetParent !== null);
    const nameOf = (control: HTMLElement) =>
      (control.getAttribute('aria-label') ?? control.textContent).trim().slice(0, 32);

    // 1. No control sits over another, and none runs off the page.
    controls.forEach((control, index) => {
      const box = control.getBoundingClientRect();
      if (box.right > window.innerWidth + 1 || box.left < -1) {
        found.push(`"${nameOf(control)}" runs off the page (${box.left}..${box.right})`);
      }
      for (const other of controls.slice(index + 1)) {
        if (control.contains(other) || other.contains(control)) continue;
        const next = other.getBoundingClientRect();
        const across = Math.min(box.right, next.right) - Math.max(box.left, next.left);
        const down = Math.min(box.bottom, next.bottom) - Math.max(box.top, next.top);
        if (across > 1 && down > 1) {
          found.push(`"${nameOf(control)}" overlaps "${nameOf(other)}" by ${across}px`);
        }
      }
      // 2. Each icon stays inside its own control.
      for (const icon of Array.from(control.querySelectorAll('svg'))) {
        const glyph = icon.getBoundingClientRect();
        if (glyph.width === 0) continue;
        if (glyph.left < box.left - 1 || glyph.right > box.right + 1) {
          found.push(`"${nameOf(control)}": a ${glyph.width}px icon in a ${box.width}px control`);
        }
      }
    });

    // The avatar's initials fit their circle (a clipped letter is lost text).
    for (const avatar of Array.from(header.querySelectorAll<HTMLElement>('.MuiAvatar-root'))) {
      if (avatar.scrollWidth > avatar.clientWidth) {
        found.push(
          `the avatar's "${avatar.textContent}" is wider (${avatar.scrollWidth}px) than its ${avatar.clientWidth}px circle`,
        );
      }
    }

    // 3. The page doesn't scroll sideways.
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      found.push(`the page scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`);
    }

    // 4. Every step shows its whole label.
    for (const step of Array.from(document.querySelectorAll('main .MuiStep-root'))) {
      const label = step.querySelector('.MuiStepLabel-label');
      if (!label) continue;
      const cell = step.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      if (text.right > cell.right + 0.5 || step.scrollWidth > step.clientWidth + 1) {
        found.push(
          `step "${label.textContent.trim()}" is cut: label ends ${text.right} past its cell's ${cell.right}`,
        );
      }
    }
    return found;
  });
}

test.describe('text resize: the shell header and the wizard stepper', () => {
  for (const width of WIDTHS) {
    for (const size of SIZES) {
      test(`keep every control and step label whole at ${size} text, ${width} px wide`, async ({
        context,
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await authenticate(context, testInfo, 'users-invite');
        await openWizard(page);
        await page.addStyleTag({ content: `html { font-size: ${size}; }` });
        await expect.poll(() => problems(page)).toEqual([]);
      });
    }
  }
});
