import { getContrastRatio } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { createFinaxisTheme } from './create-finaxis-theme';
import { BRAND, DARK, LIGHT } from './tokens';

const ALERT_SEVERITIES = ['success', 'warning', 'error', 'info'] as const;

describe('createFinaxisTheme', () => {
  const theme = createFinaxisTheme();
  const light = theme.colorSchemes.light?.palette;
  const dark = theme.colorSchemes.dark?.palette;

  it('maps the prototype tokens into both colour schemes', () => {
    expect(light?.primary.main).toBe(LIGHT.primary.main);
    expect(light?.background.default).toBe(LIGHT.background.default);
    expect(light?.surfaces).toEqual(LIGHT.surfaces);
    expect(light?.status).toEqual(LIGHT.status);
    expect(light?.avatar).toEqual(LIGHT.avatar);
    expect(light?.focus).toBe(LIGHT.focus);
    expect(dark?.primary.main).toBe(DARK.primary.main);
    expect(dark?.error.main).toBe(DARK.error.main);
    expect(dark?.surfaces).toEqual(DARK.surfaces);
    expect(dark?.status).toEqual(DARK.status);
    expect(dark?.avatar).toEqual(DARK.avatar);
    expect(dark?.focus).toBe(DARK.focus);
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

  it('shrinks the h1 page title below the md breakpoint (spec §7.2: 28px desktop, 25px mobile)', () => {
    const h1 = theme.typography.h1 as Record<string, unknown>;
    expect(h1[theme.breakpoints.down('md')]).toEqual({ fontSize: '1.5625rem' });
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

  it('runs hover/press feedback at 150-200ms (MASTER.md "Motion is functional")', () => {
    expect(theme.transitions.duration.shortest).toBe(150);
    expect(theme.transitions.duration.shorter).toBe(175);
    expect(theme.transitions.duration.short).toBe(200);
  });

  it('keeps filled Alert text at or above 4.5:1 contrast (WCAG AA, body2 12.5px) in both schemes', () => {
    // MUI 9.4 paints a *light*-scheme filled Alert on `<severity>.main`, but a *dark*-scheme one
    // on `<severity>.dark` (darken 0.3) with white text — success/warning/error all fall below
    // 4.5:1 there. theme/contrast.ts only understands #RRGGBB, not the rgb()/var() strings MUI's
    // getContrastRatio returns, so this uses MUI's own helper.
    if (!light || !dark) {
      throw new Error('Expected both colour schemes to produce a palette.');
    }
    for (const severity of ALERT_SEVERITIES) {
      const lightBg = light[severity].main;
      const lightFg = light.Alert[`${severity}FilledColor`];
      expect(getContrastRatio(lightFg, lightBg)).toBeGreaterThanOrEqual(4.5);

      const darkBg = dark.Alert[`${severity}FilledBg`];
      const darkFg = dark.Alert[`${severity}FilledColor`];
      expect(getContrastRatio(darkFg, darkBg)).toBeGreaterThanOrEqual(4.5);
      // Pins the override itself, so a silently dropped `palette.Alert` change fails here too.
      expect(darkBg).toBe(DARK[severity].main);
    }
  });
});
