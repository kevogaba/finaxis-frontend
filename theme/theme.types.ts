import type { Palette, PaletteOptions } from '@mui/material/styles';

/**
 * Finaxis brand tokens that sit outside MUI's standard semantic palette:
 * - `brand.navy` is the fixed identity color for the login brand panel (same in both schemes).
 * - `surfaces.secondary` / `surfaces.elevated` are the extra surface levels called for by the
 *   light/dark specs (beyond `background.default` / `background.paper`).
 */
export interface FinaxisBrandTokens {
  /** Fixed identity color for the login brand panel — the same in both schemes. */
  navy: string;
  /** Text/icon/border tones for content placed on top of `navy`, also scheme-independent. */
  onNavy: string;
  onNavyMuted: string;
  onNavyBorder: string;
  onNavySurface: string;
  onNavyAccent: string;
}

export interface FinaxisSurfaceTokens {
  secondary: string;
  elevated: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    brand: FinaxisBrandTokens;
    surfaces: FinaxisSurfaceTokens;
  }

  interface PaletteOptions {
    brand?: Partial<FinaxisBrandTokens>;
    surfaces?: Partial<FinaxisSurfaceTokens>;
  }
}

export type FinaxisPalette = Palette;
export type FinaxisPaletteOptions = PaletteOptions;
