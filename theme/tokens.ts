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

/** Brand-mark gradient stops (deep blue → sky → teal), used by FinaxisLogo and app/icon.tsx. */
export const MARK_GRADIENT = ['#0B61DC', '#02A2E9', '#05AD8A'] as const;

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
