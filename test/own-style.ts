/**
 * A CSS property that the element's own emotion class declares, from the stylesheets jsdom has
 * parsed. `getComputedStyle` would also report an inherited value, which hides a style that MUI
 * silently dropped (e.g. a dotted palette path in Typography's `color` prop in MUI v9).
 */
export function ownStyle(element: Element, property: string): string {
  const classes = Array.from(element.classList).map((name) => `.${name}`);
  let value = '';
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSStyleRule && classes.includes(rule.selectorText)) {
        value = rule.style.getPropertyValue(property) || value;
      }
    }
  }
  return value;
}
