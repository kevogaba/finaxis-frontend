type ResolvedProperty = 'color' | 'backgroundColor' | 'paddingTop' | 'paddingBottom';

/**
 * What a theme value (`theme.vars.palette.text.secondary`, `theme.spacing(3)`) resolves to in the
 * rendered document, for comparison with an element's computed style.
 *
 * jsdom 31 resolves `var()` and `calc()` in computed values, as a browser does, so an element's
 * computed colour is `rgb(…)`, not the `var(--…)` reference the theme emitted. Applying the same
 * theme value to a probe element and reading it back compares like with like. Call it after the
 * component under test has rendered, so the theme's custom properties are defined.
 */
export function resolvedStyle(property: ResolvedProperty, value: string): string {
  const probe = document.createElement('span');
  probe.style[property] = value;
  document.body.appendChild(probe);
  try {
    return getComputedStyle(probe)[property];
  } finally {
    probe.remove();
  }
}
