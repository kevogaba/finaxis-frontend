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

const CSS_VAR_PREFIX = 'finaxis';

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
    controlBorder: scheme.controlBorder,
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
      cssVarPrefix: CSS_VAR_PREFIX,
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
    // MUI 9.4's keyboard focus ring, spread on `.Mui-focusVisible` by ButtonBase, Link, Chip,
    // Tab, ToggleButtonGroup, … Clip-prone components (Tab inside the Tabs scroller, MenuItem)
    // inset it themselves. Default solid/2px/offset 2px keeps the ring's existing look; the colour
    // is the focus token's CSS var, written out because `theme.vars` doesn't exist yet here (the
    // render test pins it to `theme.vars.palette.focus`).
    focusVisible: { outlineColor: `var(--${CSS_VAR_PREFIX}-palette-focus)` },
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
              borderColor: theme.vars.palette.controlBorder,
              backgroundColor: theme.vars.palette.background.paper,
              '&:hover': {
                borderColor: theme.vars.palette.controlBorder,
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
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.vars.palette.controlBorder,
            },
            // Harden the notch: an explicit `slotProps.inputLabel.shrink` forwards `notched`
            // straight through (TextField.js), bypassing `defaultProps.notched: false` below and
            // re-opening the outline gap the labels-above anatomy never needs.
            '& .MuiOutlinedInput-notchedOutline legend': { maxWidth: '0.01px' },
            '&.Mui-disabled': { backgroundColor: theme.vars.palette.surfaces.secondary },
          }),
          // Single-line inputs only: a multiline root already pads its textarea, so the same
          // padding on the textarea would double it (ReasonDialog's reason field).
          input: { '&:not(textarea)': { paddingBlock: 10 } },
          // `sizeSmall` resolves against the root slot (InputBase's `inputOverridesResolver` has
          // no size branch — checked in node_modules/@mui/material/InputBase/InputBase.js), so
          // reach the actual input element the same way the notched-outline override does above:
          // a nested selector on its stable class, not a (nonexistent) `inputSizeSmall` key.
          // Density target: 40px (spec §7.2/MASTER.md). `9.5` measured ≈ 38px; solve the padding
          // from the input's own line-height instead of a fixed px number, since `em` resolves
          // against the input's computed font-size (13px body text). Covers Select's displayed
          // value too — it shares this `.MuiOutlinedInput-input` class.
          sizeSmall: {
            '& .MuiOutlinedInput-input:not(textarea)': {
              paddingBlock: 'calc((40px - 1.4375em) / 2)',
            },
          },
        },
      },
      // Autocomplete.js's own small-size CSS re-declares the outlined root's padding (6px) and,
      // within it, `.MuiAutocomplete-input`'s own padding (2.5px) — same specificity as the
      // `MuiOutlinedInput` sizeSmall override above (both are a theme-engine `styleOverrides` rule
      // scoped under this root's hash), so whichever is emitted last wins; the `inputRoot` override
      // key below nests under `.MuiAutocomplete-inputRoot`, i.e. after Autocomplete's own rule.
      // Keep the root's own 6px top/bottom and re-solve only the input's share of the 40px target
      // the same way: from the input's own line-height, not a fixed px number.
      MuiAutocomplete: {
        styleOverrides: {
          inputRoot: {
            '&.MuiInputBase-sizeSmall .MuiAutocomplete-input': {
              paddingBlock: 'calc((40px - 12px - 1.4375em) / 2)',
            },
          },
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
          // Density target: 44px single-line rows (spec §7.2/MASTER.md). Uses `height`, not
          // `minHeight` — browsers ignore `min-height` on `display: table-cell` (measured: a
          // probe cell rendered ~34px with `min-height: 44px`, the same as with no rule at all).
          // `height` on a table cell acts as a minimum instead, so a two-line row still grows past
          // it. Cells are border-box here (CssBaseline's `* { box-sizing: inherit }`), so the 44
          // already includes the 8+8px padding and the 1px bottom border. Scoped to `body` (not
          // `root`/`sizeSmall`) so the head cell (an explicit 39px `height`, checked separately)
          // and TablePagination's own cell (rendered outside any Table context, so it gets no
          // `variant` at all) are unaffected.
          body: { height: 44 },
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
          // Density target: 32px arrow buttons (spec §7.2/MASTER.md). The buttons are plain
          // IconButtons (root 42px) with no `size` prop, so reach them through the `actions`
          // wrapper's stable class instead of a `sizeSmall` IconButton variant they never opt
          // into — verified against TablePaginationActions.js/tablePaginationClasses.js: `actions`
          // resolves to `& .MuiTablePagination-actions` on the toolbar (not inert, unlike
          // `notchedOutline` above).
          actions: { '& .MuiIconButton-root': { width: 32, height: 32 } },
          // Rows-per-page (layer 07b gate finding 1). This div is a bare Select display, not a
          // ButtonBase, so it never gets the theme-wide `.Mui-focusVisible` ring (a JS class
          // ButtonBase/Tab/etc. add themselves) — MUI's own built-in style for it is only a
          // ~12%-opacity `background-color` on `:focus` (TablePagination.js's
          // `TablePaginationInputBase`), which reads as almost no cue at all (WCAG 2.4.7). Spread
          // the same resolved ring `theme.focusVisible` (not a hand copy) so it stays one place to
          // tune (Ruling 5) and keeps the house look: outset +2px, `palette.focus`.
          select: ({ theme }) => ({
            '&:focus-visible': theme.focusVisible === false ? undefined : theme.focusVisible,
          }),
        },
      },
      // A record's title is focused programmatically when a lifecycle transition leaves no other
      // control behind (branch-lifecycle-actions.tsx's `focusRecordTitle`, PF6/V7) — Typography
      // isn't a ButtonBase, so it never gets the theme-wide `.Mui-focusVisible` ring either; spread
      // the same resolved ring as the TablePagination select above instead of the browser default.
      MuiTypography: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&:focus-visible': theme.focusVisible === false ? undefined : theme.focusVisible,
          }),
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
      MuiStepper: {
        // Cells, not connectors (spec §7.3): the prototype's bordered wizard header.
        defaultProps: { connector: null },
        styleOverrides: {
          root: ({ theme }) => ({
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            alignItems: 'stretch',
            // The 1px gaps over the divider-coloured root draw every cell border, for any number
            // of steps.
            gap: '1px',
            overflow: 'hidden',
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: 6,
            backgroundColor: theme.vars.palette.divider,
            [theme.breakpoints.up('md')]: {
              gridTemplateColumns: 'none',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(0, 1fr)',
            },
          }),
        },
      },
      MuiStep: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 72,
            padding: '13px 16px',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: theme.vars.palette.background.paper,
            // Below md, an odd last step spans the two-column grid's last row.
            '&:nth-of-type(odd):last-of-type': { gridColumn: '1 / -1' },
            [theme.breakpoints.up('md')]: {
              '&:nth-of-type(odd):last-of-type': { gridColumn: 'auto' },
            },
          }),
        },
        variants: [
          {
            // Step has no active class; its ownerState carries `active`.
            props: { active: true },
            style: ({ theme }) => ({
              backgroundColor: theme.vars.palette.status.infoBg,
              boxShadow: `inset 0 -3px 0 ${theme.vars.palette.primary.main}`,
            }),
          },
        ],
      },
      MuiStepLabel: {
        styleOverrides: {
          iconContainer: { paddingRight: 11 },
          label: ({ theme }) => ({
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: theme.vars.palette.text.secondary,
            '&.Mui-active, &.Mui-completed': {
              color: theme.vars.palette.text.primary,
              fontWeight: 700,
            },
          }),
        },
      },
      MuiStepIcon: {
        styleOverrides: {
          root: ({ theme }) => ({
            width: 29,
            height: 29,
            color: theme.vars.palette.surfaces.tertiary,
            '&.Mui-active': { color: theme.vars.palette.primary.main },
            '&.Mui-completed': { color: theme.vars.palette.success.main },
            '&.Mui-active .MuiStepIcon-text': { fill: theme.vars.palette.primary.contrastText },
          }),
          text: ({ theme }) => ({ fill: theme.vars.palette.text.secondary, fontWeight: 800 }),
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
        // The `gap` below is the only spacing; MUI's default sibling margin would add 8px to it.
        defaultProps: { disableSpacing: true },
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
