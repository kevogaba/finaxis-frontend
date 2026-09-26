import { createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type {} from './theme.types';
import { BRAND, DARK, LIGHT } from './tokens';

/**
 * MUI ships `theme.vars`/`theme.colorSchemes` typed as optional/absent unless a consumer opts in
 * (see `CssThemeVariables` JSDoc in `@mui/material/styles/createThemeNoVars.d.ts`) — this app always
 * enables `cssVariables`, so every theme consumer needs them non-optional.
 */
declare module '@mui/material/styles' {
  interface CssThemeVariables {
    enabled: true;
  }
}

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

/**
 * Overlay shadow (dialogs/popovers/menus): no CSS-variable form, so light and dark values are
 * emitted as a base style plus a `theme.applyStyles('dark', …)` override — the MUI-recommended
 * way to branch cssVariables themes without baking in a static `theme.palette.mode` (which is
 * fixed at theme-creation time and would never flip at runtime).
 */
function overlayShadowStyles(theme: Theme) {
  return [
    { boxShadow: LIGHT.overlayShadow },
    theme.applyStyles('dark', { boxShadow: DARK.overlayShadow }),
  ] as const;
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
      dark: {
        palette: {
          ...paletteFor('dark', DARK),
          // MUI paints dark-scheme filled Alerts on `<severity>.dark` (darken 0.3) with white
          // text, which falls below 4.5:1 for success/warning/error — pin the fill and text to
          // tokens that pass (theme/create-finaxis-theme.test.ts).
          Alert: {
            successFilledBg: DARK.success.main,
            successFilledColor: DARK.background.default,
            warningFilledBg: DARK.warning.main,
            warningFilledColor: DARK.background.default,
            errorFilledBg: DARK.error.main,
            errorFilledColor: DARK.background.default,
            infoFilledBg: DARK.info.main,
            infoFilledColor: DARK.background.default,
          },
        },
      },
    },
    spacing: 4,
    shape: { borderRadius: 6 },
    // Spec: hover/press feedback runs 150-200ms (MASTER.md "Motion is functional"). Only the
    // short end of MUI's scale moves — `standard`/`complex` (dialogs, larger transitions) keep
    // MUI's defaults. `prefers-reduced-motion` still wins regardless: the `!important` rule in
    // app/globals.css's `@layer base` overrides any duration, MUI's included.
    transitions: { duration: { shortest: 150, shorter: 175, short: 200 } },
    typography: {
      fontFamily: FONT_STACK,
      htmlFontSize: 16,
      fontSize: 13,
      h1: {
        fontSize: '1.75rem',
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        // Spec §7.2: 28px desktop, 25px mobile. `theme.breakpoints` doesn't exist yet inside
        // this object (it's built from it), so `down('md')` is inlined — CSSProperties' index
        // signature (createMixins.d.ts) allows an arbitrary nested-selector key here, and
        // `createTypography` merges it straight through onto `theme.typography.h1`.
        // ponytail: hardcodes the default `md` breakpoint (900px); switch to a
        // `components.MuiTypography.styleOverrides.h1` function using `theme.breakpoints` if
        // this theme ever customises breakpoints.
        '@media (max-width:899.95px)': { fontSize: '1.5625rem' },
      },
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
          // Anatomy only here — `color` must not sit in `root`, or it overrides every MUI
          // colour variant (color="primary"/"inherit"/etc. all fall back to a fixed colour).
          // The neutral look is scoped to the `default` colour via a variant below instead.
          root: { borderRadius: 6, width: 42, height: 42 },
          sizeSmall: { width: 32, height: 32 },
        },
        variants: [
          {
            props: { color: 'default' },
            style: ({ theme }) => ({
              color: theme.vars.palette.text.secondary,
              '&:hover': {
                backgroundColor: theme.vars.palette.surfaces.secondary,
                color: theme.vars.palette.text.primary,
              },
            }),
          },
        ],
      },
      MuiChip: {
        styleOverrides: {
          // Chip.js's own transition (`getTransitionStyles(theme, ['background-color',
          // 'box-shadow'])`) defaults to duration.standard (300ms) — override the same two
          // properties at duration.short so the hover/focus ring above (finding 2) actually
          // lands in the spec's 150-200ms window instead of MUI's slower default.
          root: ({ theme }) => ({
            borderRadius: 999,
            fontWeight: 750,
            transition: theme.transitions.create(['background-color', 'box-shadow'], {
              duration: theme.transitions.duration.short,
            }),
          }),
          // No per-size label slot exists on ChipClasses; scope the label's padding to the small
          // root via a nested selector instead of a fictitious `labelSmall` override key.
          sizeSmall: {
            height: 22,
            fontSize: '0.6875rem',
            '& .MuiChip-label': { paddingInline: 8 },
          },
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
          // `.map()`'s callback has no contextual type to infer `theme` from (unlike an object
          // literal placed directly in the array), so it needs an explicit annotation — safe now
          // that the `CssThemeVariables` augmentation above makes the plain `Theme` import's
          // `vars`/`colorSchemes` non-optional too.
          ...SOFT_CHIP_COLORS.map((color) => ({
            props: { variant: 'soft' as const, color },
            style: ({ theme }: { theme: Theme }) => ({
              backgroundColor: theme.vars.palette.status[SOFT_BACKGROUND[color]],
              color: theme.vars.palette[color].main,
              // MUI's own clickable+colour variant (Chip.js) repaints :hover and
              // .Mui-focusVisible with palette[color].dark while text stays .main — 1.6–2:1.
              // Re-assert the soft background (adding `.MuiChip-clickable` beats its plain
              // `:hover` on specificity; matching `.Mui-focusVisible` wins because theme
              // variants are always emitted after the component's own styles) and signal the
              // interaction with a ring instead of a colour change.
              '&.MuiChip-clickable:hover, &.Mui-focusVisible': {
                backgroundColor: theme.vars.palette.status[SOFT_BACKGROUND[color]],
                boxShadow: `inset 0 0 0 1px ${theme.vars.palette[color].main}`,
              },
              // MUI's own filled-colour variant paints the delete icon in contrastText at
              // 70% opacity — meant for a solid `palette[color].main` fill, not our soft tint.
              '& .MuiChip-deleteIcon': {
                color: theme.vars.palette[color].main,
                '&:hover, &:active': {
                  color: theme.vars.palette[color].main,
                },
              },
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
          // `styleOverrides.notchedOutline` looks like the obvious key for the fieldset/legend,
          // but it's inert: OutlinedInput renders that slot via `useSlot`, which never consults
          // `theme.components.MuiOutlinedInput.styleOverrides` (checked in
          // node_modules/@mui/material/OutlinedInput/OutlinedInput.js and utils/useSlot.js), and
          // its own styled() call (NotchedOutline.js) registers no slot/overridesResolver either.
          // Reach the legend the same proven way `root` already reaches the outline's border
          // colour above: a nested selector on the stable `.MuiOutlinedInput-notchedOutline`
          // class, which the root's `rootOverridesResolver` *does* apply.
          root: ({ theme }) => ({
            borderRadius: 6,
            backgroundColor: theme.vars.palette.background.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.divider },
            // Harden the notch: an explicit `slotProps.inputLabel.shrink` forwards `notched`
            // straight through (TextField.js), bypassing `defaultProps.notched: false` below and
            // re-opening the outline gap the labels-above anatomy never needs.
            '& .MuiOutlinedInput-notchedOutline legend': { maxWidth: '0.01px' },
            '&.Mui-disabled': { backgroundColor: theme.vars.palette.surfaces.secondary },
          }),
          input: { paddingBlock: 10 },
          // `sizeSmall` resolves against the root slot (InputBase's `inputOverridesResolver` has
          // no size branch — checked in node_modules/@mui/material/InputBase/InputBase.js), so
          // reach the actual input element the same way the notched-outline override does above:
          // a nested selector on its stable class, not a (nonexistent) `inputSizeSmall` key.
          sizeSmall: { '& .MuiOutlinedInput-input': { paddingBlock: 9.5 } },
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
          paper: ({ theme }) => [{ borderRadius: 14 }, ...overlayShadowStyles(theme)],
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
          root: ({ theme }) => [
            {
              '&:not(.MuiBackdrop-invisible)': {
                backgroundColor: LIGHT.backdrop,
                backdropFilter: 'blur(3px)',
              },
            },
            theme.applyStyles('dark', {
              '&:not(.MuiBackdrop-invisible)': { backgroundColor: DARK.backdrop },
            }),
          ],
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: ({ theme }) => [{ borderRadius: 10 }, ...overlayShadowStyles(theme)],
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => [{ borderRadius: 10 }, ...overlayShadowStyles(theme)],
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
