import { fireEvent } from '@testing-library/react';

type ActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * Presses Escape on the element `target` returns, in the microtask after a DOM change first makes
 * it return one: the same task as the render that made the change, before React runs that
 * render's passive effects, as a person pressing Escape the moment the change shows. Run what
 * causes the change outside act() (`clickOutsideAct`, or a promise settled before `waitFor`), so
 * React schedules its work as a browser does. Call `dispose` in a `finally`: a regression that
 * never makes the change must not leave the observer pressing Escape in a later test.
 */
export function pressEscapeWhen(target: () => Element | null) {
  let pressed = false;
  const observer = new MutationObserver(() => {
    const element = target();
    if (!element) return;
    observer.disconnect();
    pressed = true;
    fireEvent.keyDown(element, { key: 'Escape' });
  });
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  return {
    pressed: () => pressed,
    dispose: () => {
      observer.disconnect();
    },
  };
}

/**
 * A native click outside act(): React then schedules what the click starts as a browser does,
 * where act() would flush every render and effect before the next microtask. Follow it at once
 * with `waitFor`, which keeps act() off while React works.
 */
export function clickOutsideAct(element: HTMLElement) {
  const actGlobal = globalThis as ActGlobal;
  const previous = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  actGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    element.click();
  } finally {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}
