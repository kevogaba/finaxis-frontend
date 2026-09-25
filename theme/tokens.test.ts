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
