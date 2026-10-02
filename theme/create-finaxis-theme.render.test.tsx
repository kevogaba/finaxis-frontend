import { describe, expect, it, vi } from 'vitest';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import DialogActions from '@mui/material/DialogActions';
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

/** The value the cascade applies for `property` on `.<hash><suffix>`: the last declaration across
 * every emitted rule with exactly that selector (emotion can split one class into several rules). */
function effectiveDeclaration(
  css: string,
  hashClass: string,
  selectorSuffix: string,
  property: string,
): string | undefined {
  const escapedHash = hashClass.replace(/[.:#]/g, '\\$&');
  const pattern = new RegExp(`\\.${escapedHash}${selectorSuffix}\\{([^}]*)\\}`, 'g');
  let value: string | undefined;
  for (const match of css.matchAll(pattern)) {
    for (const declaration of (match[1] ?? '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0 && declaration.slice(0, colon).trim() === property) {
        value = declaration.slice(colon + 1).trim();
      }
    }
  }
  return value;
}

/** The full selector and declarations of the last emitted rule whose selector ends in the
 * literal, stable `suffix` text (e.g. `.MuiTablePagination-select:focus-visible`) — for a
 * component whose own emotion hash class lands on an ancestor node (TablePagination's InputBase
 * wrapper), not on the focusable element itself, so `hashClassOf`/`effectiveDeclaration` (keyed
 * off the target element's own hash class) can't find it. */
function ruleEndingIn(css: string, suffix: string): { selector: string; declarations: string } {
  const escaped = suffix.replace(/[.:#]/g, '\\$&');
  const pattern = new RegExp(`([^{}]*${escaped})\\{([^}]*)\\}`, 'g');
  let found: { selector: string; declarations: string } | undefined;
  for (const match of css.matchAll(pattern)) {
    found = { selector: match[1] ?? '', declarations: match[2] ?? '' };
  }
  if (!found) {
    throw new Error(`No rule found ending in ${suffix}`);
  }
  return found;
}

function propertyValue(declarations: string, property: string): string | undefined {
  for (const declaration of declarations.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0 && declaration.slice(0, colon).trim() === property) {
      return declaration.slice(colon + 1).trim();
    }
  }
  return undefined;
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

describe('MuiChip transition speed (finding 10)', () => {
  it("runs background-color/box-shadow feedback at duration.short, not MUI's 300ms default", () => {
    // jsdom's CSSOM doesn't resolve the `transition` shorthand back into its longhands
    // (getComputedStyle(...).transitionProperty reports the initial value, "all", regardless of
    // what's actually declared) — read the emitted CSS text directly instead, the same way the
    // hover-cascade assertions above do.
    const { container } = renderWithProviders(<Chip label="Active" />);
    const chip = container.querySelector('.MuiChip-root');
    if (!chip) throw new Error('Chip root not found');

    const hash = hashClassOf(chip);
    // The bare, unconditional rule for this render's class — no pseudo-class or nested selector
    // attached — carries every merged top-level property in one rule body, MUI's base style and
    // this theme's `styleOverrides.root` concatenated in that order (not deep-merged). A property
    // both sides set, like `transition`, appears twice; ordinary CSS same-rule cascade applies, so
    // the last occurrence — this theme's override — is the one that actually takes effect.
    const baseRule = new RegExp(`\\.${hash.replace(/[.:#]/g, '\\$&')}\\{([^}]*)\\}`).exec(
      allEmittedCss(),
    )?.[1];
    if (!baseRule) throw new Error('No base rule found for the chip');
    let transitionDeclaration: string | undefined;
    for (const match of baseRule.matchAll(/transition:([^;]*);/g)) {
      transitionDeclaration = match[1];
    }
    if (!transitionDeclaration) throw new Error('No transition declaration found');

    expect(transitionDeclaration).toContain('background-color');
    expect(transitionDeclaration).toContain('box-shadow');
    // MASTER.md: "hover/press feedback runs 150-200ms" — MUI's own default for this transition
    // is duration.standard (300ms); this theme moves it to duration.short (200ms) instead.
    expect(transitionDeclaration).not.toContain('300ms');
    expect(transitionDeclaration).toContain('200ms');
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

      // MUI 9.4's `focusVisible` theme option also paints `.Mui-focusVisible` with
      // `box-shadow: var(--_focusVisible-shadow, 0 0)` — prove the soft variant's own inset ring
      // (emitted after, per the comment above) still wins the cascade instead of that empty shadow.
      const focusBoxShadow = getComputedStyle(chip).boxShadow;
      expect(focusBoxShadow).toContain('inset');
      expect(focusBoxShadow.includes(varName(theme.vars.palette[color].main))).toBe(true);

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

/** Every emitted rule whose selector matches `el` and that declares `property` — computed styles
 * can't answer this in jsdom, which neither resolves logical properties (`padding-block`) nor
 * reliably applies MUI's sibling-combinator spacing rule. */
function rulesDeclaring(el: Element, property: string): string[] {
  return [...allEmittedCss().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector = '', declarations = '']) => {
      if (!declarations.split(';').some((d) => d.trim().startsWith(`${property}:`))) return false;
      return selector.split(',').some((part) => {
        try {
          return el.matches(part.trim());
        } catch {
          return false;
        }
      });
    })
    .map(([, selector = '']) => selector.trim());
}

describe('MuiDialogActions spacing', () => {
  it('leaves the theme gap as the only space between actions', () => {
    const { getByText } = renderWithProviders(
      <DialogActions>
        <Button>Cancel</Button>
        <Button>Confirm</Button>
      </DialogActions>,
    );
    const confirm = getByText('Confirm');
    expect(confirm.parentElement?.classList).not.toContain('MuiDialogActions-spacing');
    expect(rulesDeclaring(confirm, 'margin-left')).toEqual([]);
  });
});

describe('MuiOutlinedInput padding', () => {
  it('pads a single-line input but leaves a multiline textarea to the root', () => {
    const { getByLabelText } = renderWithProviders(
      <>
        <TextField label="Single" size="small" />
        <TextField label="Reason" size="small" multiline minRows={3} />
      </>,
    );
    expect(rulesDeclaring(getByLabelText('Single'), 'padding-block')).not.toEqual([]);
    expect(rulesDeclaring(getByLabelText('Reason'), 'padding-block')).toEqual([]);
  });
});

describe('focus ring (MUI focusVisible; deferred from layer 02)', () => {
  it('draws the theme-wide ring in the focus token', () => {
    const ring = theme.focusVisible;
    if (!ring) throw new Error('theme.focusVisible is not enabled');
    expect(ring).toMatchObject({ outlineStyle: 'solid', outlineWidth: 2 });
    expect(varName(ring.outlineColor ?? '')).toBe(varName(theme.vars.palette.focus));
  });

  it('insets a Tab ring so the Tabs scroller cannot clip it', () => {
    const { getByRole } = renderWithProviders(
      <Tabs value={0} aria-label="Record sections">
        <Tab label="Overview" />
      </Tabs>,
    );
    const hash = hashClassOf(getByRole('tab', { name: 'Overview' }));
    const css = allEmittedCss();

    expect(effectiveDeclaration(css, hash, '', '--_focusVisible-offset')).toBe('-3');
    // The old MuiButtonBase override re-declared a literal `outline-offset: 2px` after MUI's
    // var-based offset, which re-outset the Tab ring — the effective value must be the calc.
    expect(effectiveDeclaration(css, hash, '\\.Mui-focusVisible', 'outline-offset')).toMatch(
      /^calc\(var\(--_focusVisible-offset/,
    );
  });

  it('keeps an ordinary button ring outset, in the focus colour', () => {
    const { getByRole } = renderWithProviders(<Button>Save</Button>);
    const hash = hashClassOf(getByRole('button', { name: 'Save' }));
    const css = allEmittedCss();

    expect(effectiveDeclaration(css, hash, '', '--_focusVisible-offset')).toBe('1');
    expect(
      varName(effectiveDeclaration(css, hash, '\\.Mui-focusVisible', 'outline-color') ?? ''),
    ).toBe(varName(theme.vars.palette.focus));
  });
});

describe('TablePagination rows-per-page select focus ring (layer 07b gate finding 1)', () => {
  it('gives the keyboard-focused select the house ring: outset, in the focus colour', () => {
    const { getByRole } = renderWithProviders(
      <TablePagination
        component="div"
        count={25}
        page={0}
        rowsPerPage={10}
        onPageChange={vi.fn()}
        onRowsPerPageChange={vi.fn()}
      />,
    );
    const css = allEmittedCss();

    // The combobox div's own emotion hash class lands on an ancestor (the InputBase wrapper),
    // so read the rule off the stable `.MuiTablePagination-select` class instead.
    const { selector, declarations } = ruleEndingIn(
      css,
      '.MuiTablePagination-select:focus-visible',
    );

    // Prove the rule actually reaches the rendered combobox, not just that some rule with this
    // literal text exists: `matches()` resolves the full (ancestor-hash-prefixed) selector
    // against the real document tree.
    const combobox = getByRole('combobox', { name: /rows per page/i });
    expect(combobox.matches(selector.replace(':focus-visible', ''))).toBe(true);

    expect(varName(propertyValue(declarations, 'outline-color') ?? '')).toBe(
      varName(theme.vars.palette.focus),
    );
    // Same house ring as an ordinary button: outset (the `--_focusVisible-offset` default of 1),
    // not the inset Tab/rail variants.
    expect(propertyValue(declarations, 'outline-offset')).toMatch(
      /^calc\(var\(--_focusVisible-offset/,
    );
  });
});
