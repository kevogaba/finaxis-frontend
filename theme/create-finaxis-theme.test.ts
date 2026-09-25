import { describe, expect, it } from 'vitest';
import { createFinaxisTheme } from './create-finaxis-theme';
import { BRAND, DARK, LIGHT } from './tokens';

describe('createFinaxisTheme', () => {
  const theme = createFinaxisTheme();
  const light = theme.colorSchemes.light?.palette;
  const dark = theme.colorSchemes.dark?.palette;

  it('maps the prototype tokens into both colour schemes', () => {
    expect(light?.primary.main).toBe(LIGHT.primary.main);
    expect(light?.background.default).toBe(LIGHT.background.default);
    expect(light?.surfaces.tertiary).toBe(LIGHT.surfaces.tertiary);
    expect(light?.status.warningBg).toBe(LIGHT.status.warningBg);
    expect(light?.focus).toBe(LIGHT.focus);
    expect(dark?.primary.main).toBe(DARK.primary.main);
    expect(dark?.error.main).toBe(DARK.error.main);
    expect(dark?.status.infoBg).toBe(DARK.status.infoBg);
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
});
