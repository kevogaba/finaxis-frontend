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
