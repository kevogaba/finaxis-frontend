import type { ReactNode } from 'react';
import { createTheme, ThemeProvider, type Theme } from '@mui/material/styles';

/** How much the theme's breakpoints are scaled: 1024px divided by this is the emulated width. */
const SCALE = 4;

function phoneBreakpoints(outer: Theme): Theme {
  const values = Object.fromEntries(
    Object.entries(outer.breakpoints.values).map(([key, value]) => [key, value * SCALE]),
  ) as Theme['breakpoints']['values'];
  return { ...outer, breakpoints: createTheme({ breakpoints: { values } }).breakpoints };
}

/**
 * Renders `children` as a phone would lay them out.
 *
 * jsdom 31 applies `@media` rules at a fixed 1024px viewport that tests cannot change, which is
 * at or above `md`, so a control styled `display: { md: 'none' }` is hidden, as it is on a desktop.
 * Scaling the theme's breakpoints by 4 puts that 1024px below `sm` (the equivalent of a 256px
 * phone), so the phone-only rules apply and the phone layout can be exercised. It agrees with
 * `test/setup.ts`, whose `matchMedia` never matches.
 */
export function PhoneViewport({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={phoneBreakpoints}>{children}</ThemeProvider>;
}
