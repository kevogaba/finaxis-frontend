/**
 * WCAG 2.x relative luminance and contrast ratio for opaque #RRGGBB colours. Used by the token
 * contrast gate (theme/tokens.test.ts); not shipped to the browser in any hot path.
 */
function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Expected a #RRGGBB colour, got "${hex}".`);
  }
  const [, red = '00', green = '00', blue = '00'] = match;
  return (
    0.2126 * linearChannel(Number.parseInt(red, 16)) +
    0.7152 * linearChannel(Number.parseInt(green, 16)) +
    0.0722 * linearChannel(Number.parseInt(blue, 16))
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
