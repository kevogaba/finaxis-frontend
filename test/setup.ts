import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia implementation at runtime, even though the DOM lib
// types declare it as always present — this check is real, not redundant.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof window !== 'undefined' && !window.matchMedia) {
  // A query list that never matches. EventTarget supplies the change-event methods MUI's
  // useMediaQuery subscribes through; the legacy addListener/removeListener are declared only
  // because the DOM type still requires them (a class declares them, where an object literal
  // typed as MediaQueryList would count as using the deprecated members).
  class NeverMatchingMediaQueryList extends EventTarget implements MediaQueryList {
    readonly matches = false;
    readonly media: string;
    onchange: MediaQueryList['onchange'] = null;

    constructor(media: string) {
      super();
      this.media = media;
    }

    addListener(): void {
      // Legacy subscription: nothing to subscribe to, as the query never changes.
    }

    removeListener(): void {
      // Legacy subscription: nothing was subscribed.
    }
  }

  window.matchMedia = (query: string): MediaQueryList => new NeverMatchingMediaQueryList(query);
}
