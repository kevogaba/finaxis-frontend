import { describe, expect, it } from 'vitest';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { renderWithProviders } from '@/test/test-utils';
import { createFinaxisTheme } from './create-finaxis-theme';

/**
 * Regression coverage for the final-review findings that only surface once MUI's own
 * built-in component styles and this theme's overrides/variants are actually composed and
 * rendered — a plain object inspection of `createFinaxisTheme()`'s output can't see this,
 * because the bug is about which style wins, not what either style contains in isolation.
 */

const theme = createFinaxisTheme();

/** Emotion serializes CSS custom properties with a fallback, e.g. `var(--x, #fff)`; jsdom's
 * CSSOM strips the fallback back off when it re-serializes a computed value. Compare on the
 * bare `--custom-property` name instead of the exact string so the assertion doesn't depend on
 * that round-trip detail. */
function varName(value: string): string {
  const name = /var\((--[\w-]+)/.exec(value)?.[1];
  if (!name) {
    throw new Error(`Expected a var() reference, got "${value}".`);
  }
  return name;
}

function allEmittedCss(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((tag) => tag.textContent)
    .join('\n');
}

/** The one emotion-generated hash class MUI attaches alongside its stable `Mui*` classes. */
function hashClassOf(el: Element): string {
  const hash = [...el.classList].find((cls) => cls.startsWith('css-'));
  if (!hash) {
    throw new Error(`No emotion hash class on ${el.className}`);
  }
  return hash;
}

/** Declaration block of the last rule in `css` whose selector contains `hashClass` and
 * `selectorSuffix` — "last" because later-inserted, equal-or-lower-specificity rules are what
 * this theme relies on to beat MUI's own built-in variants (see create-finaxis-theme.ts). */
function lastRuleDeclarations(css: string, hashClass: string, selectorSuffix: string): string {
  const escapedHash = hashClass.replace(/[.:#]/g, '\\$&');
  const pattern = new RegExp(`\\.${escapedHash}${selectorSuffix}[^{]*\\{([^}]*)\\}`, 'g');
  let declarations: string | undefined;
  for (const match of css.matchAll(pattern)) {
    declarations = match[1];
  }
  if (declarations === undefined) {
    throw new Error(`No rule found for .${hashClass}${selectorSuffix}`);
  }
  return declarations;
}

describe('MuiIconButton colour (finding 1)', () => {
  it('gives an uncoloured IconButton the neutral text colour', () => {
    const { getByLabelText } = renderWithProviders(<IconButton aria-label="default" />);
    expect(varName(getComputedStyle(getByLabelText('default')).color)).toBe(
      varName(theme.vars.palette.text.secondary),
    );
  });

  it('does not force text.secondary onto a coloured IconButton', () => {
    const { getByLabelText } = renderWithProviders(
      <>
        <IconButton color="primary" aria-label="primary" />
        <IconButton color="inherit" aria-label="inherit" />
      </>,
    );

    const primaryColor = getComputedStyle(getByLabelText('primary')).color;
    const inheritColor = getComputedStyle(getByLabelText('inherit')).color;
    const secondaryVar = varName(theme.vars.palette.text.secondary);

    // Root cause was `root` unconditionally setting `color`, which stomps every MUI colour
    // variant (probe from the finding: Alert's close button, TablePagination's arrows).
    expect(primaryColor.includes(secondaryVar)).toBe(false);
    expect(inheritColor.includes(secondaryVar)).toBe(false);
    expect(varName(primaryColor)).toBe(varName(theme.vars.palette.primary.main));
  });
});

describe('MuiOutlinedInput notch (finding 8)', () => {
  it('keeps the outline closed even when a consumer explicitly re-declares shrink', () => {
    // TextField.js forwards an explicit `slotProps.inputLabel.shrink` straight through as
    // `notched` on the OutlinedInput (bypassing this theme's `defaultProps: { notched: false }`),
    // which re-opens the legend gap the labels-above anatomy doesn't need.
    const { container } = renderWithProviders(
      <TextField label="Account number" slotProps={{ inputLabel: { shrink: true } }} />,
    );
    const legend = container.querySelector('legend');
    if (!legend) throw new Error('legend not found');
    expect(getComputedStyle(legend).maxWidth).toBe('0.01px');
  });
});

describe.each(['success', 'warning', 'error', 'info'] as const)(
  'MuiChip soft %s variant (finding 2)',
  (color) => {
    function renderSoftChip() {
      return renderWithProviders(
        <Chip
          variant="soft"
          color={color}
          clickable
          onClick={() => undefined}
          onDelete={() => undefined}
          label="Active"
        />,
      );
    }

    const softBackgroundKey = (
      { success: 'successBg', warning: 'warningBg', error: 'dangerBg', info: 'infoBg' } as const
    )[color];

    it('keeps the soft background on hover/focus instead of switching to the solid dark fill', () => {
      const { container } = renderSoftChip();
      const chip = container.querySelector('.MuiChip-root');
      if (!chip) throw new Error('Chip root not found');

      const softBgVar = varName(theme.vars.palette.status[softBackgroundKey]);
      const darkVar = varName(theme.vars.palette[color].dark);

      // `.Mui-focusVisible` is a plain DOM class (not a pseudo-class), so jsdom's cssstyle
      // engine resolves it via ordinary class-selector cascade rules — unlike `:hover`.
      chip.classList.add('Mui-focusVisible');
      const focusBg = getComputedStyle(chip).backgroundColor;
      expect(focusBg.includes(softBgVar)).toBe(true);
      expect(focusBg.includes(darkVar)).toBe(false);

      // jsdom never matches real `:hover` (no mouse state), so prove the hover fix the way
      // the browser actually resolves it: by cascade over the emitted CSS text. MUI's own
      // "clickable coloured" hover rule is bare `:hover` (specificity 0,0,2,0); this theme's
      // fix adds `.MuiChip-clickable:hover` (0,0,3,0) so it wins regardless of source order.
      const hash = hashClassOf(chip);
      const hoverDeclarations = lastRuleDeclarations(
        allEmittedCss(),
        hash,
        '\\.MuiChip-clickable:hover',
      );
      expect(hoverDeclarations.includes(`background-color:var(${softBgVar}`)).toBe(true);
    });

    it('colours the delete icon with the semantic foreground, not a contrastText tint', () => {
      const { container } = renderSoftChip();
      const deleteIcon = container.querySelector('.MuiChip-deleteIcon');
      if (!deleteIcon) throw new Error('Delete icon not found');

      const mainVar = varName(theme.vars.palette[color].main);
      const contrastVar = varName(theme.vars.palette[color].contrastText);
      const restColor = getComputedStyle(deleteIcon).color;
      expect(restColor.includes(mainVar)).toBe(true);
      expect(restColor.includes(contrastVar)).toBe(false);
    });
  },
);
