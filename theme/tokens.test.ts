import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { createFinaxisTheme } from './create-finaxis-theme';
import { BRAND, DARK, LIGHT } from './tokens';

const AA_TEXT = 4.5;
/** WCAG 2.1 SC 1.4.11 (non-text contrast): UI components / graphical objects need 3:1, not 4.5:1. */
const AA_NON_TEXT = 3;

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

  it.each([
    ['focus on background.default', scheme.focus, scheme.background.default],
    ['focus on background.paper', scheme.focus, scheme.background.paper],
    ['focus on surfaces.secondary', scheme.focus, scheme.surfaces.secondary],
    ['focus on surfaces.tertiary', scheme.focus, scheme.surfaces.tertiary],
    ['focus on brand.navy', scheme.focus, BRAND.navy],
    ['focus on brand.deep', scheme.focus, BRAND.deep],
    ['controlBorder on background.paper', scheme.controlBorder, scheme.background.paper],
    ['controlBorder on background.default', scheme.controlBorder, scheme.background.default],
  ] as [string, string, string][])(
    '%s meets non-text WCAG AA (3:1)',
    (_label, foreground, background) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    },
  );
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
    ['onNavyAccent on navy', BRAND.onNavyAccent, BRAND.navy],
    ['onNavyAccent on deep', BRAND.onNavyAccent, BRAND.deep],
  ])('%s meets WCAG AA (4.5:1)', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('app/globals.css', () => {
  it('holds no raw colour literals (theme/tokens.ts is the source of truth)', () => {
    const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  });

  it('references only CSS variables the theme emits', () => {
    const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
    const emitted = JSON.stringify(createFinaxisTheme().vars);
    const referenced = [...css.matchAll(/var\((--finaxis-[\w-]+)/g)].map((m) => m[1] ?? '');
    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((name) => !emitted.includes(`var(${name},`))).toEqual([]);
  });
});
