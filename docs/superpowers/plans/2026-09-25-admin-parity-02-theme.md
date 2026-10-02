# PR 02: Theme and Brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Port the prototype's design tokens, type scale, and density into the MUI theme (with AA
dark mode), recreate the brand mark as SVG, and replace the stale design-system master file.

**Architecture:** Tokens live in `theme/tokens.ts` (plain objects, unit-tested for WCAG contrast);
`theme/create-finaxis-theme.ts` maps them into MUI `colorSchemes`, typography, and component
overrides/variants; `theme/theme.types.ts` augments MUI types. Components keep consuming palette
paths, so no call site changes except the brand mark internals.

**Tech Stack:** MUI 9.4 theming (`createTheme`, `colorSchemes`, `cssVariables`, `components`
overrides and `variants`), Vitest.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §7 (tokens, type,
density, overrides, brand)

## Global Constraints

See the index. Additionally:

- Status text colours may only sit on `background.default`, `background.paper`, or their own soft
  status background (light-mode amber and teal fall below 4.5:1 on the grey surface tiers).
- The focus indicator is a solid 2 px `palette.focus` outline with a 2 px offset (a 35 % tint, as in
  the prototype, is ~1.6:1 against white — below the visibility we need).

## Review Focus

Covered by the index's list; this layer pins **contrast** (Task 1) because every later layer relies
on the tokens.

---

### Task 1: Tokens, type augmentation, and a contrast gate

**Files:**

- Create: `theme/tokens.ts`
- Create: `theme/contrast.ts`
- Create: `theme/contrast.test.ts`
- Create: `theme/tokens.test.ts`
- Modify: `theme/theme.types.ts` (full rewrite below)

**Interfaces:**

- Produces: `BRAND`, `LIGHT`, `DARK` token objects (`theme/tokens.ts`); `contrastRatio(foreground:
string, background: string): number` (`theme/contrast.ts`); palette augmentation `brand`
  (`deep`, `navy`, `raised`, `onNavy`, `onNavyMuted`, `onNavyBorder`, `onNavySurface`, `onNavyAccent`,
  `railMarker`, `railActive`), `surfaces` (`secondary`, `tertiary`, `elevated`), `status` (`successBg`,
  `warningBg`, `dangerBg`, `infoBg`), `avatar` (`bg`, `fg`), `focus`; Chip variant `soft`.

- [ ] **Step 1: Write the failing contrast-function test**

`theme/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('rejects anything that is not #RRGGBB', () => {
    expect(() => relativeLuminance('rgba(0,0,0,.5)')).toThrow(/#RRGGBB/);
    expect(() => relativeLuminance('#FFF')).toThrow(/#RRGGBB/);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('matches a known WCAG pair', () => {
    // #767676 on white is the canonical 4.54:1 grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run theme/contrast.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement `theme/contrast.ts`**

```ts
/**
 * WCAG 2.x relative luminance and contrast ratio for opaque #RRGGBB colours. Used by the token
 * contrast gate (theme/tokens.test.ts); not shipped to the browser in any hot path.
 */
function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Expected a #RRGGBB colour, got "${hex}".`);
  }
  const [, red = '00', green = '00', blue = '00'] = match;
  return (
    0.2126 * linearChannel(Number.parseInt(red, 16)) +
    0.7152 * linearChannel(Number.parseInt(green, 16)) +
    0.0722 * linearChannel(Number.parseInt(blue, 16))
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test:run theme/contrast.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing token contrast gate**

`theme/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { BRAND, DARK, LIGHT } from './tokens';

const AA_TEXT = 4.5;

type Scheme = typeof LIGHT | typeof DARK;

function textPairs(scheme: Scheme): [string, string, string][] {
  const surfaces = {
    default: scheme.background.default,
    paper: scheme.background.paper,
    secondary: scheme.surfaces.secondary,
    tertiary: scheme.surfaces.tertiary,
  };
  const neutral = Object.entries(surfaces).flatMap(([surfaceName, surface]) => [
    [`text.primary on ${surfaceName}`, scheme.text.primary, surface] as [string, string, string],
    [`text.secondary on ${surfaceName}`, scheme.text.secondary, surface] as [
      string,
      string,
      string,
    ],
    [`primary.main on ${surfaceName}`, scheme.primary.main, surface] as [string, string, string],
  ]);
  const semantic: [string, string, string][] = [
    ['success', scheme.success.main, scheme.status.successBg],
    ['warning', scheme.warning.main, scheme.status.warningBg],
    ['error', scheme.error.main, scheme.status.dangerBg],
    ['info', scheme.info.main, scheme.status.infoBg],
  ].flatMap(([name = '', color = '', softBackground = '']) => [
    [`${name} on its soft background`, color, softBackground] as [string, string, string],
    [`${name} on paper`, color, scheme.background.paper] as [string, string, string],
    [`${name} on default`, color, scheme.background.default] as [string, string, string],
  ]);
  const onSoft: [string, string, string][] = Object.entries(scheme.status).map(([name, bg]) => [
    `text.secondary on ${name}`,
    scheme.text.secondary,
    bg,
  ]);
  return [
    ...neutral,
    ...semantic,
    ...onSoft,
    ['primary.contrastText on primary.main', scheme.primary.contrastText, scheme.primary.main],
    ['primary.contrastText on primary.dark', scheme.primary.contrastText, scheme.primary.dark],
    ['avatar.fg on avatar.bg', scheme.avatar.fg, scheme.avatar.bg],
  ];
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('%s scheme tokens', (_name, scheme) => {
  it.each(textPairs(scheme))('%s meets WCAG AA (4.5:1)', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('brand rail tokens', () => {
  it.each([
    ['onNavy on deep', BRAND.onNavy, BRAND.deep],
    ['onNavy on navy', BRAND.onNavy, BRAND.navy],
    ['onNavy on raised', BRAND.onNavy, BRAND.raised],
    ['onNavyMuted on deep', BRAND.onNavyMuted, BRAND.deep],
    ['onNavyMuted on navy', BRAND.onNavyMuted, BRAND.navy],
    ['onNavyMuted on raised', BRAND.onNavyMuted, BRAND.raised],
    ['railMarker on navy', BRAND.railMarker, BRAND.navy],
  ])('%s meets WCAG AA (4.5:1)', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test:run theme/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./tokens"`.

- [ ] **Step 7: Implement `theme/tokens.ts`**

```ts
/**
 * Finaxis design tokens, ported from the Administration prototype's styles.css
 * (`[data-theme]` blocks and `:root` brand scale). Dark-scheme semantic foregrounds and the dark
 * primary are lightened from the prototype so every text pair meets WCAG AA — enforced by
 * theme/tokens.test.ts. Components never import these directly; they use palette paths.
 */
export const BRAND = {
  deep: '#071A36',
  navy: '#0A2347',
  raised: '#123663',
  onNavy: '#EEF6FF',
  onNavyMuted: '#B8C7DA',
  onNavyBorder: 'rgba(255, 255, 255, 0.12)',
  onNavySurface: 'rgba(255, 255, 255, 0.07)',
  onNavyAccent: 'rgba(117, 162, 255, 0.85)',
  railMarker: '#75A2FF',
  /** Active rail item fill (a gradient, used as `backgroundImage`). */
  railActive: 'linear-gradient(90deg, rgba(47, 109, 242, 0.65), rgba(47, 109, 242, 0.25))',
} as const;

export const LIGHT = {
  background: { default: '#F5F8FC', paper: '#FFFFFF' },
  surfaces: { secondary: '#F0F4F9', tertiary: '#E8EEF6', elevated: '#FFFFFF' },
  text: { primary: '#0A1B3C', secondary: '#526681' },
  divider: '#D5DFEB',
  focus: '#2F6DF2',
  primary: { main: '#1F5FE5', dark: '#164BC5', contrastText: '#FFFFFF' },
  success: { main: '#007A6E' },
  warning: { main: '#B95100' },
  error: { main: '#B4232E' },
  info: { main: '#1F5FE5' },
  status: {
    successBg: '#E8F7F3',
    warningBg: '#FFF4E8',
    dangerBg: '#FFF0F1',
    infoBg: '#EDF4FF',
  },
  avatar: { bg: '#DDEBFF', fg: '#1456C9' },
  overlayShadow: '0 10px 28px rgba(7, 26, 54, 0.11)',
  backdrop: 'rgba(4, 13, 28, 0.6)',
} as const;

export const DARK = {
  background: { default: '#081322', paper: '#101E30' },
  surfaces: { secondary: '#15263B', tertiary: '#1B3048', elevated: '#101E30' },
  text: { primary: '#F3F7FC', secondary: '#A7B8CC' },
  divider: '#2A405A',
  focus: '#78A5FF',
  primary: { main: '#78A5FF', dark: '#5B8DEF', contrastText: '#081322' },
  success: { main: '#3DD9B8' },
  warning: { main: '#FFB454' },
  error: { main: '#FF8A8A' },
  info: { main: '#78A5FF' },
  status: {
    successBg: '#0D352F',
    warningBg: '#3E2917',
    dangerBg: '#3C1D25',
    infoBg: '#172D4D',
  },
  avatar: { bg: '#172D4D', fg: '#8AB4FF' },
  overlayShadow: '0 12px 32px rgba(0, 0, 0, 0.36)',
  backdrop: 'rgba(3, 10, 20, 0.7)',
} as const;
```

- [ ] **Step 8: Rewrite `theme/theme.types.ts`**

```ts
import type { Palette, PaletteOptions } from '@mui/material/styles';

/**
 * Finaxis tokens outside MUI's standard palette. `brand.*` is scheme-independent (the navigation
 * rail and login brand panel are always navy); the rest have light and dark values
 * (theme/tokens.ts). Consume them as palette paths, e.g. `sx={{ bgcolor: 'status.warningBg' }}`.
 */
export interface FinaxisBrandTokens {
  /** Darkest navy — top of the rail gradient. */
  deep: string;
  /** Identity navy — rail and login brand panel. */
  navy: string;
  /** Raised navy for hover/emphasis on navy surfaces. */
  raised: string;
  onNavy: string;
  onNavyMuted: string;
  onNavyBorder: string;
  onNavySurface: string;
  onNavyAccent: string;
  /** Active navigation marker on the rail. */
  railMarker: string;
  /** Active rail item fill — a CSS gradient for `backgroundImage`, not a colour. */
  railActive: string;
}

export interface FinaxisSurfaceTokens {
  secondary: string;
  tertiary: string;
  /** Same as `background.paper`; kept for existing call sites. */
  elevated: string;
}

export interface FinaxisStatusTokens {
  successBg: string;
  warningBg: string;
  dangerBg: string;
  infoBg: string;
}

export interface FinaxisAvatarTokens {
  bg: string;
  fg: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    brand: FinaxisBrandTokens;
    surfaces: FinaxisSurfaceTokens;
    status: FinaxisStatusTokens;
    avatar: FinaxisAvatarTokens;
    focus: string;
  }

  interface PaletteOptions {
    brand?: Partial<FinaxisBrandTokens>;
    surfaces?: Partial<FinaxisSurfaceTokens>;
    status?: Partial<FinaxisStatusTokens>;
    avatar?: Partial<FinaxisAvatarTokens>;
    focus?: string;
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    /** Pill with a soft semantic background — the prototype's status badge. */
    soft: true;
  }
}

export type FinaxisPalette = Palette;
export type FinaxisPaletteOptions = PaletteOptions;
```

- [ ] **Step 9: Run the token gate and typecheck**

Run: `pnpm test:run theme/ && pnpm typecheck`
Expected: PASS (all contrast pairs); typecheck clean. If a pair fails, adjust only the failing
dark-scheme value in `theme/tokens.ts` toward a lighter tone and re-run — never lower the threshold.

- [ ] **Step 10: Commit**

```bash
git add theme/tokens.ts theme/contrast.ts theme/contrast.test.ts theme/tokens.test.ts theme/theme.types.ts
git commit -m "$(cat <<'EOF'
feat(theme): add prototype design tokens with a WCAG AA contrast gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Theme — palette, typography, density, and component overrides

**Files:**

- Modify: `theme/create-finaxis-theme.ts` (full rewrite below)
- Create: `theme/create-finaxis-theme.test.ts`
- Modify: `app/layout.tsx` (viewport `themeColor` values)
- Modify: `app/globals.css` (Tailwind bridge additions)

**Interfaces:**

- Consumes: Task 1 tokens and augmentation.
- Produces: `createFinaxisTheme()` (unchanged signature). Typography mapping used by later layers:
  page title `variant="h1"` (28 px), record title `variant="h2"` (25 px), section/surface title
  `variant="h5"` with `component="h2"`/`"h3"` (17 px), dense cell text `body2` (12.5 px), meta
  `caption` (11 px), eyebrow `overline` (12 px, no uppercase). Chip `variant="soft"`. Component
  defaults: `size="small"` for `TextField`, `Select`, `Table`, `IconButton` is 42 px square.

- [ ] **Step 1: Load skills**

Invoke the project skills `material-ui-theming` and `material-ui-styling`; skim `AGENTS.md` of each for
`colorSchemes` + `cssVariables` and `components.variants` rules.

- [ ] **Step 2: Write the failing theme test**

`theme/create-finaxis-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createFinaxisTheme } from './create-finaxis-theme';
import { BRAND, DARK, LIGHT } from './tokens';

describe('createFinaxisTheme', () => {
  const theme = createFinaxisTheme();
  const light = theme.colorSchemes.light?.palette;
  const dark = theme.colorSchemes.dark?.palette;

  it('maps the prototype tokens into both colour schemes', () => {
    expect(light?.primary.main).toBe(LIGHT.primary.main);
    expect(light?.background.default).toBe(LIGHT.background.default);
    expect(light?.surfaces.tertiary).toBe(LIGHT.surfaces.tertiary);
    expect(light?.status.warningBg).toBe(LIGHT.status.warningBg);
    expect(light?.focus).toBe(LIGHT.focus);
    expect(dark?.primary.main).toBe(DARK.primary.main);
    expect(dark?.error.main).toBe(DARK.error.main);
    expect(dark?.status.infoBg).toBe(DARK.status.infoBg);
  });

  it('keeps brand tokens identical in both schemes', () => {
    expect(light?.brand).toEqual(BRAND);
    expect(dark?.brand).toEqual(BRAND);
  });

  it('uses the dense Finaxis type scale', () => {
    expect(theme.typography.h1.fontSize).toBe('1.75rem');
    expect(theme.typography.h5.fontSize).toBe('1.0625rem');
    expect(theme.typography.body1.fontSize).toBe('0.8125rem');
    expect(theme.typography.caption.fontSize).toBe('0.6875rem');
    expect(theme.typography.overline.textTransform).toBe('none');
    expect(theme.typography.button.textTransform).toBe('none');
  });

  it('defaults dense components to their small size', () => {
    expect(theme.components?.MuiTextField?.defaultProps?.size).toBe('small');
    expect(theme.components?.MuiSelect?.defaultProps?.size).toBe('small');
    expect(theme.components?.MuiTable?.defaultProps?.size).toBe('small');
  });

  it('registers the soft chip variant', () => {
    const variants = theme.components?.MuiChip?.variants ?? [];
    expect(
      variants.some(
        (variant) =>
          typeof variant.props === 'object' &&
          'variant' in variant.props &&
          variant.props.variant === 'soft',
      ),
    ).toBe(true);
  });

  it('uses 6 px as the base radius', () => {
    expect(theme.shape.borderRadius).toBe(6);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:run theme/create-finaxis-theme.test.ts`
Expected: FAIL (old palette values, e.g. `expected '#1D4ED8' to be '#1F5FE5'`).

- [ ] **Step 4: Rewrite `theme/create-finaxis-theme.ts`**

```ts
import { createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type {} from './theme.types';
import { BRAND, DARK, LIGHT } from './tokens';

const FONT_STACK = [
  'var(--font-finaxis)',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
].join(',');

type Scheme = typeof LIGHT | typeof DARK;

function paletteFor(mode: 'light' | 'dark', scheme: Scheme) {
  return {
    mode,
    primary: scheme.primary,
    secondary: { main: scheme.success.main },
    success: scheme.success,
    warning: scheme.warning,
    error: scheme.error,
    info: scheme.info,
    background: scheme.background,
    text: scheme.text,
    divider: scheme.divider,
    brand: BRAND,
    surfaces: scheme.surfaces,
    status: scheme.status,
    avatar: scheme.avatar,
    focus: scheme.focus,
  };
}

function overlayShadow(theme: Theme): string {
  return theme.palette.mode === 'dark' ? DARK.overlayShadow : LIGHT.overlayShadow;
}

const SOFT_CHIP_COLORS = ['success', 'warning', 'error', 'info'] as const;
const SOFT_BACKGROUND = {
  success: 'successBg',
  warning: 'warningBg',
  error: 'dangerBg',
  info: 'infoBg',
} as const;

/**
 * Single theme, two colour schemes (`colorSchemeSelector: 'class'` so InitColorSchemeScript can set
 * the scheme before hydration). Tokens come from theme/tokens.ts; density and component anatomy
 * follow the Administration prototype (spec §7).
 */
export function createFinaxisTheme() {
  return createTheme({
    cssVariables: {
      cssVarPrefix: 'finaxis',
      colorSchemeSelector: 'class',
    },
    colorSchemes: {
      light: { palette: paletteFor('light', LIGHT) },
      dark: { palette: paletteFor('dark', DARK) },
    },
    spacing: 4,
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: FONT_STACK,
      htmlFontSize: 16,
      fontSize: 13,
      h1: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.5625rem', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.015em' },
      h3: { fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' },
      h4: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' },
      h5: { fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' },
      h6: { fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.35 },
      subtitle1: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4 },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.4 },
      body1: { fontSize: '0.8125rem', lineHeight: 1.5 },
      body2: { fontSize: '0.78125rem', lineHeight: 1.45 },
      caption: { fontSize: '0.6875rem', lineHeight: 1.4 },
      overline: {
        fontSize: '0.75rem',
        fontWeight: 650,
        lineHeight: 1.4,
        letterSpacing: 0,
        textTransform: 'none',
      },
      button: { fontSize: '0.8125rem', fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
    },
    components: {
      MuiButtonBase: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.Mui-focusVisible': {
              outline: `2px solid ${theme.vars.palette.focus}`,
              outlineOffset: 2,
            },
          }),
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 40, paddingInline: 16, borderRadius: 6 },
          sizeSmall: { minHeight: 36, paddingInline: 12, fontSize: '0.75rem' },
          sizeLarge: { minHeight: 48, paddingInline: 20 },
        },
        variants: [
          {
            // The prototype's "secondary" button: neutral text on the paper surface.
            props: { variant: 'outlined', color: 'primary' },
            style: ({ theme }) => ({
              color: theme.vars.palette.text.primary,
              borderColor: theme.vars.palette.divider,
              backgroundColor: theme.vars.palette.background.paper,
              '&:hover': {
                borderColor: theme.vars.palette.divider,
                backgroundColor: theme.vars.palette.surfaces.secondary,
              },
            }),
          },
          {
            // Destructive actions: red text on the danger soft background.
            props: { variant: 'outlined', color: 'error' },
            style: ({ theme }) => ({
              backgroundColor: theme.vars.palette.status.dangerBg,
              '&:hover': { backgroundColor: theme.vars.palette.status.dangerBg },
            }),
          },
        ],
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 6,
            width: 42,
            height: 42,
            color: theme.vars.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.vars.palette.surfaces.secondary,
              color: theme.vars.palette.text.primary,
            },
          }),
          sizeSmall: { width: 32, height: 32 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 750 },
          sizeSmall: { height: 22, fontSize: '0.6875rem' },
          labelSmall: { paddingInline: 8 },
        },
        variants: [
          {
            props: { variant: 'soft' },
            style: ({ theme }) => ({
              border: 0,
              backgroundColor: theme.vars.palette.surfaces.secondary,
              color: theme.vars.palette.text.secondary,
            }),
          },
          ...SOFT_CHIP_COLORS.map((color) => ({
            props: { variant: 'soft' as const, color },
            style: ({ theme }: { theme: Theme }) => ({
              backgroundColor: theme.vars.palette.status[SOFT_BACKGROUND[color]],
              color: theme.vars.palette[color].main,
            }),
          })),
        ],
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundImage: 'none',
            border: `1px solid ${theme.vars.palette.divider}`,
          }),
        },
      },
      MuiAppBar: {
        defaultProps: { color: 'inherit', elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.background.paper,
            border: 0,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
          }),
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small', fullWidth: true },
      },
      MuiFormControl: {
        defaultProps: { margin: 'none', size: 'small' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
      MuiInputLabel: {
        defaultProps: { shrink: true },
        styleOverrides: {
          // Labels sit above the field (prototype form anatomy), not inside the outline.
          root: ({ theme }) => ({
            position: 'relative',
            transform: 'none',
            marginBottom: 6,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: theme.vars.palette.text.primary,
            '&.Mui-focused': { color: theme.vars.palette.text.primary },
            '&.Mui-error': { color: theme.vars.palette.error.main },
          }),
        },
      },
      MuiOutlinedInput: {
        defaultProps: { notched: false },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 6,
            backgroundColor: theme.vars.palette.background.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.divider },
            '&.Mui-disabled': { backgroundColor: theme.vars.palette.surfaces.secondary },
          }),
          input: { paddingBlock: 10 },
          inputSizeSmall: { paddingBlock: 9.5 },
        },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginInline: 0, fontSize: '0.6875rem' } },
      },
      MuiTable: {
        defaultProps: { size: 'small' },
      },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            fontSize: '0.78125rem',
          }),
          sizeSmall: { paddingBlock: 8, paddingInline: 14 },
          head: ({ theme }) => ({
            height: 39,
            paddingBlock: 0,
            fontSize: '0.75rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            color: theme.vars.palette.text.secondary,
            backgroundColor: theme.vars.palette.surfaces.secondary,
          }),
          stickyHeader: ({ theme }) => ({ backgroundColor: theme.vars.palette.surfaces.secondary }),
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.MuiTableRow-hover:hover': { backgroundColor: theme.vars.palette.surfaces.secondary },
          }),
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: { borderTop: 0 },
          toolbar: { minHeight: 52 },
          selectLabel: { fontSize: '0.75rem' },
          displayedRows: { fontSize: '0.75rem' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 48,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
          }),
          indicator: { height: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 48,
            paddingInline: 16,
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: theme.vars.palette.text.secondary,
            '&:hover': { color: theme.vars.palette.text.primary },
          }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: 14, boxShadow: overlayShadow(theme) }),
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: ({ theme }) => ({
            paddingBlock: 14,
            paddingInline: 18,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            fontSize: '1.25rem',
            fontWeight: 700,
          }),
        },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: 20, '&&': { paddingTop: 20 } } },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: ({ theme }) => ({
            paddingBlock: 14,
            paddingInline: 18,
            gap: 10,
            borderTop: `1px solid ${theme.vars.palette.divider}`,
          }),
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&:not(.MuiBackdrop-invisible)': {
              backgroundColor: theme.palette.mode === 'dark' ? DARK.backdrop : LIGHT.backdrop,
              backdropFilter: 'blur(3px)',
            },
          }),
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: 10, boxShadow: overlayShadow(theme) }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: 10, boxShadow: overlayShadow(theme) }),
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: { backgroundColor: BRAND.deep, fontSize: '0.75rem', fontWeight: 650 },
          arrow: { color: BRAND.deep },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: ({ theme }) => ({
            height: 8,
            borderRadius: 999,
            backgroundColor: theme.vars.palette.surfaces.tertiary,
          }),
          bar: { borderRadius: 999 },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 8, alignItems: 'flex-start' } },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
      },
      MuiCheckbox: {
        defaultProps: { color: 'primary' },
      },
      MuiCircularProgress: {
        defaultProps: { thickness: 4 },
      },
      MuiAvatar: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.avatar.bg,
            color: theme.vars.palette.avatar.fg,
            fontWeight: 800,
          }),
        },
      },
    },
  });
}
```

Notes for the implementer:

- `theme.palette.mode` inside style callbacks is fine only for values with no CSS-variable form
  (shadows, backdrop). If the MUI styling skill flags flicker, switch those two to
  `theme.applyStyles('dark', { … })`.
- If TypeScript rejects `theme.vars.palette.status[SOFT_BACKGROUND[color]]`, index with a typed
  helper: `const bg: keyof FinaxisStatusTokens = SOFT_BACKGROUND[color];`.

- [ ] **Step 5: Update the viewport colours in `app/layout.tsx`**

Replace the `themeColor` array:

```ts
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F8FC' },
    { media: '(prefers-color-scheme: dark)', color: '#081322' },
  ],
```

(`viewport` metadata requires literal colours; they mirror `background.default`.)

- [ ] **Step 6: Extend the Tailwind bridge in `app/globals.css`**

Inside `@theme inline { … }` add after `--color-divider`:

```css
--color-surface: var(--finaxis-palette-background-paper);
--color-surface-secondary: var(--finaxis-palette-surfaces-secondary);
```

- [ ] **Step 7: Run tests, lint, typecheck**

Run: `pnpm test:run && pnpm lint && pnpm typecheck`
Expected: all pass. Existing component tests don't assert colours; if one asserts an old palette
value, update the expectation to the token value.

- [ ] **Step 8: Commit**

```bash
git add theme/create-finaxis-theme.ts theme/create-finaxis-theme.test.ts app/layout.tsx app/globals.css
git commit -m "$(cat <<'EOF'
feat(theme): apply prototype palette, dense type scale, and component overrides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Brand mark as SVG and favicon

**Files:**

- Modify: `components/branding/finaxis-logo.tsx` (full rewrite)
- Modify: `components/branding/finaxis-logo.test.tsx` (full rewrite)
- Modify: `app/icon.tsx` (full rewrite)

**Interfaces:**

- Produces: `FinaxisLogo({ size?: number, …SVGProps })` — same props as today (call sites in
  `app/(public)/login/page.tsx` and `components/shell/global-header.tsx` stay unchanged). Decorative:
  `aria-hidden`, `focusable="false"`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max` (icons domain: `--domain icons "brand mark svg"`).

- [ ] **Step 2: Write the failing test**

`components/branding/finaxis-logo.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FinaxisLogo } from './finaxis-logo';

describe('FinaxisLogo', () => {
  it('renders a decorative 40px mark by default', () => {
    const { container } = render(<FinaxisLogo />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('draws the two interlocking strokes with a gradient', () => {
    const { container } = render(<FinaxisLogo size={64} />);

    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelector('linearGradient')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('width', '64');
  });

  it('gives each instance its own gradient id so marks never collide', () => {
    const { container } = render(
      <>
        <FinaxisLogo />
        <FinaxisLogo />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((node) => node.id);

    expect(new Set(ids).size).toBe(2);
    container.querySelectorAll('rect').forEach((rect) => {
      expect(ids.map((id) => `url(#${id})`)).toContain(rect.getAttribute('fill'));
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:run components/branding/finaxis-logo.test.tsx`
Expected: FAIL (0 `rect` with gradient fill; no `linearGradient`).

- [ ] **Step 4: Rewrite `components/branding/finaxis-logo.tsx`**

```tsx
'use client';

import { useId } from 'react';
import type { SVGProps } from 'react';

interface FinaxisLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * The Finaxis mark: two interlocking strokes rising left to right — members, institutions, and
 * transactions moving through one governed platform — shading from deep blue to teal. Recreated
 * from the prototype's raster mark (spec §7.4). Decorative: always paired with visible "Finaxis"
 * text. Client component only for `useId`, so repeated marks never share a gradient id.
 */
export function FinaxisLogo({ size = 40, ...props }: FinaxisLogoProps) {
  const gradientId = `finaxis-mark-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="36"
          x2="32"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0B61DC" />
          <stop offset="0.55" stopColor="#02A2E9" />
          <stop offset="1" stopColor="#05AD8A" />
        </linearGradient>
      </defs>
      <rect
        x="11"
        y="3"
        width="8"
        height="26"
        rx="4"
        transform="rotate(35 15 16)"
        fill={`url(#${gradientId})`}
      />
      <rect
        x="21"
        y="11"
        width="8"
        height="26"
        rx="4"
        transform="rotate(35 25 24)"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
```

(The mark's colours are brand artwork, like a logo file, not UI tokens — the no-raw-colour rule
applies to component styling.)

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test:run components/branding/finaxis-logo.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Rewrite `app/icon.tsx` from the same geometry**

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon rendered from the same geometry as `FinaxisLogo` on the navy brand tile. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#0A2347',
        borderRadius: 8,
      }}
    >
      <svg width="32" height="32" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="mark" x1="8" y1="36" x2="32" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0B61DC" />
            <stop offset="0.55" stopColor="#02A2E9" />
            <stop offset="1" stopColor="#05AD8A" />
          </linearGradient>
        </defs>
        <rect
          x="11"
          y="3"
          width="8"
          height="26"
          rx="4"
          transform="rotate(35 15 16)"
          fill="url(#mark)"
        />
        <rect
          x="21"
          y="11"
          width="8"
          height="26"
          rx="4"
          transform="rotate(35 25 24)"
          fill="url(#mark)"
        />
      </svg>
    </div>,
    { ...size },
  );
}
```

- [ ] **Step 7: Visual check**

Run `pnpm dev`, open `http://localhost:3100/login` and `/icon` in the browser pane; screenshot both
schemes (theme toggle on the login page). The mark must read as two rising strokes on the navy
panel and on white. Adjust only `rotate`/`x`/`y` values if the silhouette is off; keep the tests
green.

- [ ] **Step 8: Commit**

```bash
git add components/branding/finaxis-logo.tsx components/branding/finaxis-logo.test.tsx app/icon.tsx
git commit -m "$(cat <<'EOF'
feat(brand): recreate the Finaxis interlocking mark as SVG and favicon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Replace the stale design-system master file

**Files:**

- Modify: `design-system/finaxis-platform-administration/MASTER.md` (full rewrite)

**Interfaces:** documentation read by `ui-ux-pro-max` retrieval in later layers.

- [ ] **Step 1: Generate reference guidance (not persisted)**

```bash
python "/home/ogaba/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/scripts/search.py" "core banking SACCO administration console data-dense enterprise" --design-system --density 9 --motion 2 --variance 3 -p "Finaxis Administration" -f markdown
```

Keep its UX rules and anti-patterns in mind; ignore its palette and fonts (the prototype's win).

- [ ] **Step 2: Rewrite `design-system/finaxis-platform-administration/MASTER.md`**

```markdown
# Design System Master File — Finaxis Administration

> **LOGIC:** When building a specific page, first check `design-system/finaxis-platform-administration/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.
> Source of truth: the Administration prototype (`DESIGN_SYSTEM.md`, `styles.css`) as captured in
> `docs/superpowers/specs/2026-09-25-admin-prototype-parity-design.md` §7. Tokens live in
> `theme/tokens.ts`; components consume palette paths, never raw colours.

**Project:** Finaxis Administration (tenant Administration + Platform Administration)
**Category:** Core banking operations console — dense, governed, audit-first
**Design dials:** Variance 3/10 (quiet, consistent) · Motion 2/10 (functional only) · Density 9/10

## Brand

- Dependable before decorative. Navy anchors navigation and trust; cobalt is the action colour; teal
  is reserved for healthy/successful states.
- Mark: two interlocking strokes shading deep blue → teal (`components/branding/finaxis-logo.tsx`).
  Tagline: People · Savings · Progress.

## Colour tokens

| Role                      | Light                                                     | Dark                                    |
| ------------------------- | --------------------------------------------------------- | --------------------------------------- |
| Page background           | `#F5F8FC`                                                 | `#081322`                               |
| Surface (paper)           | `#FFFFFF`                                                 | `#101E30`                               |
| Surface 2 / 3             | `#F0F4F9` / `#E8EEF6`                                     | `#15263B` / `#1B3048`                   |
| Text / muted              | `#0A1B3C` / `#526681`                                     | `#F3F7FC` / `#A7B8CC`                   |
| Divider                   | `#D5DFEB`                                                 | `#2A405A`                               |
| Primary action            | `#1F5FE5` (hover `#164BC5`)                               | `#78A5FF` (hover `#5B8DEF`, dark text)  |
| Success / warning / error | `#007A6E` / `#B95100` / `#B4232E`                         | `#3DD9B8` / `#FFB454` / `#FF8A8A`       |
| Soft status backgrounds   | `#E8F7F3` `#FFF4E8` `#FFF0F1` `#EDF4FF`                   | `#0D352F` `#3E2917` `#3C1D25` `#172D4D` |
| Brand rail (both schemes) | `#071A36` → `#0A2347`, raised `#123663`, marker `#75A2FF` | same                                    |
| Focus                     | `#2F6DF2`                                                 | `#78A5FF`                               |

Rules: every text pair meets 4.5:1 (enforced by `theme/tokens.test.ts`); status text only on paper,
page background, or its own soft background; never convey status by colour alone (chips carry
labels).

## Typography

Inter with tabular numerals. Page title 28 px/700 (`h1`); record title 25 px (`h2`); section title
17 px (`h5` rendered as `h2`/`h3`); body 13 px; dense cells 12.5 px; captions 11 px; eyebrow 12 px/650
(`overline`, no uppercase); buttons 13 px/700, sentence case.

## Density and layout

- 4 px base unit, 8 px rhythm. App bar 68 px; rail 232 px expanded / 76 px collapsed.
- Table header 39 px; rows 44 px (single line) / ~56 px (two lines); controls 40 px (small 36 px);
  icon buttons 42 px; tabs 48 px.
- Radii: 6 px controls and surfaces, 10 px menus/popovers, 14 px dialogs; pills fully rounded.
- Borders carry grouping; shadows only on overlays. Record pages max-width 1480 px.

## Component anatomy (MUI)

- Status badge: `Chip variant="soft" size="small" color=…` via `StatusChip`.
- Primary action: `Button variant="contained"`; secondary: `variant="outlined"` (neutral text on
  paper); destructive: `variant="outlined" color="error"` (danger soft background).
- Forms: labels above fields (theme default), helper text below, errors on the field plus an error
  summary `Alert`; wizards use `Stepper` with numbered cells and a sticky action bar.
- Lists: `Paper` → toolbar (search, filters, clear, count) → sticky-header `Table` →
  `TablePagination` (10–50 rows). Record pages: back link → hero `Paper` → link `Tabs` → panels.
- Overlays: `Dialog` for decisions (reason required where the API requires it), right `Drawer` for
  assignment and detail panels, `Snackbar` + `Alert` for outcomes.

## Interaction principles

- The current workspace, organisation/branch (or All branches), and business date are always
  visible in the app bar.
- A person can hold many roles — identity shows name and email, never a single role.
- High-risk actions use explicit review steps, reasons, and permanence warnings; maker-checker is
  explained, not hidden.
- Motion is functional: 150–200 ms transitions, disabled under `prefers-reduced-motion`.

## Anti-patterns

- ❌ Mock or sample data in any UI; unavailable features are absent, not faked.
- ❌ Raw colours in components; Tailwind utilities overriding MUI visuals.
- ❌ Emojis as icons (use `@mui/icons-material` Outlined set).
- ❌ Unbounded lists; client-side pagination of server data.
- ❌ Layout-shifting hover effects; invisible focus; colour-only status.

## Pre-delivery checklist

- [ ] Tokens only (no raw colours); MUI visuals, Tailwind layout only
- [ ] One `h1`; labelled controls; errors tied to fields; visible focus
- [ ] Light and dark schemes checked; no serious/critical axe violations
- [ ] 375 / 768 / 1024 / 1440 px: no horizontal page scroll; long values truncate with a tooltip
- [ ] Loading, empty, error (with request reference), and forbidden states designed
- [ ] `prefers-reduced-motion` respected
```

- [ ] **Step 3: Format and commit**

```bash
pnpm exec prettier --write design-system/finaxis-platform-administration/MASTER.md
git add design-system/finaxis-platform-administration/MASTER.md
git commit -m "$(cat <<'EOF'
docs(design-system): replace stale master file with the prototype design system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Layer verification

**Files:** none.

- [ ] **Step 1: Full gates**

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass — including `e2e/login.spec.ts`'s axe scan in both colour schemes. If axe
reports `color-contrast` on the login page, fix the offending `sx` to use a token pair already
covered by `theme/tokens.test.ts`.

- [ ] **Step 2: Visual check and checklist**

In the browser pane, screenshot `/login` (light + dark, 1440 px and 375 px). Run the
ui-ux-pro-max pre-delivery checklist from `MASTER.md` against it. Record anything that needs a
follow-up in the layer's PR description.
