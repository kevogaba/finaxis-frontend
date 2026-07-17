import { createTheme } from '@mui/material/styles';
import type {} from './theme.types';

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

const BRAND_NAVY = '#0F1F3D';
const PRIMARY_BLUE = '#1D4ED8';
const SECONDARY_TEAL = '#0F766E';

/**
 * The brand panel is always rendered on navy, regardless of light/dark scheme,
 * so its on-navy tokens are identical in both — defined once and reused below.
 */
const ON_NAVY_TOKENS = {
  navy: BRAND_NAVY,
  onNavy: '#F8FAFC',
  onNavyMuted: 'rgba(248, 250, 252, 0.75)',
  onNavyBorder: 'rgba(248, 250, 252, 0.16)',
  onNavySurface: 'rgba(248, 250, 252, 0.06)',
  onNavyAccent: 'rgba(147, 197, 253, 0.85)',
};

/**
 * Single theme, two color schemes. `colorSchemeSelector: 'class'` lets
 * `InitColorSchemeScript` toggle schemes via a class on `<html>` before hydration,
 * avoiding an SSR flash of the wrong mode.
 */
export function createFinaxisTheme() {
  return createTheme({
    cssVariables: {
      cssVarPrefix: 'finaxis',
      colorSchemeSelector: 'class',
    },
    colorSchemes: {
      light: {
        palette: {
          mode: 'light',
          primary: { main: PRIMARY_BLUE },
          secondary: { main: SECONDARY_TEAL },
          brand: ON_NAVY_TOKENS,
          background: {
            default: '#F6F8FB',
            paper: '#FFFFFF',
          },
          surfaces: {
            secondary: '#F1F5F9',
            elevated: '#FFFFFF',
          },
          text: {
            primary: '#0F172A',
            secondary: '#475569',
          },
          divider: '#D8DEE9',
          success: { main: '#047857' },
          warning: { main: '#B45309' },
          error: { main: '#B91C1C' },
          info: { main: '#0369A1' },
        },
      },
      dark: {
        palette: {
          mode: 'dark',
          primary: { main: '#60A5FA' },
          secondary: { main: '#2DD4BF' },
          brand: ON_NAVY_TOKENS,
          background: {
            default: '#0B1220',
            paper: '#111827',
          },
          surfaces: {
            secondary: '#111827',
            elevated: '#162033',
          },
          text: {
            primary: '#F8FAFC',
            secondary: '#CBD5E1',
          },
          divider: '#253247',
          success: { main: '#34D399' },
          warning: { main: '#FBBF24' },
          error: { main: '#F87171' },
          info: { main: '#38BDF8' },
        },
      },
    },
    spacing: 4,
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily: FONT_STACK,
      button: {
        textTransform: 'none',
        fontWeight: 600,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingInline: 20,
          },
          sizeLarge: {
            minHeight: 48,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
      },
      MuiFormControl: {
        defaultProps: {
          margin: 'normal',
        },
      },
      MuiCheckbox: {
        defaultProps: {
          color: 'primary',
        },
      },
      MuiLink: {
        defaultProps: {
          underline: 'hover',
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundImage: 'none',
            border: `1px solid ${theme.vars.palette.divider}`,
          }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minWidth: 44,
            minHeight: 44,
          },
        },
      },
      MuiCircularProgress: {
        defaultProps: {
          thickness: 4,
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: `2px solid ${PRIMARY_BLUE}`,
              outlineOffset: 2,
            },
          },
        },
      },
    },
  });
}
