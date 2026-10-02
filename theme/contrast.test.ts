import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('rejects anything that is not #RRGGBB', () => {
    expect(() => relativeLuminance('rgba(0,0,0,.5)')).toThrow(/#RRGGBB/);
    expect(() => relativeLuminance('#FFF')).toThrow(/#RRGGBB/);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('matches a known WCAG pair', () => {
    // #767676 on white is the canonical 4.54:1 grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});
