'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs, { tabsClasses } from '@mui/material/Tabs';
import NextLink from '@/components/navigation/next-link';

/** MUI's tab scroll animation lasts `transitions.duration.standard` (300 ms), plus a margin. */
const SCROLL_ANIMATION_MS = 350;

export interface RecordTab {
  /** A nested route; the record root is the Overview tab. */
  href: string;
  label: string;
}

interface RecordTabsProps {
  /** Names the navigation landmark, e.g. `Westlands Branch sections`. */
  label: string;
  tabs: readonly RecordTab[];
}

/** The deepest tab whose href is the current path or an ancestor of it (sub-routes keep their
 * tab; the record root — tabs[0], Overview — only matches its own exact path, never an unlisted
 * or hidden sub-route below it). */
function activeTab([root, ...rest]: readonly RecordTab[], pathname: string): string | false {
  if (pathname === root?.href) return root.href;
  let active: string | false = false;
  for (const tab of rest) {
    const matches = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (matches && (active === false || tab.href.length > active.length)) active = tab.href;
  }
  return active;
}

/**
 * Record sections as link tabs (spec §9): each tab is a nested route — deep-linkable, fetching its
 * own data — while the shared layout renders the hero. Arrow keys move between tabs (MUI Tabs);
 * Enter follows the link.
 */
export function RecordTabs({ label, tabs }: RecordTabsProps) {
  const pathname = usePathname();
  const active = activeTab(tabs, pathname);
  const navRef = useRef<HTMLElement>(null);

  // `scrollButtons="auto"` decides whether to add the two 40px scroll buttons only after mount
  // (an IntersectionObserver checks the first/last tab), but MUI's own scroll-into-view already ran
  // by then, sized for a scroller without them (Tabs.js `scrollSelectedIntoView`, gated on
  // `indicatorStyle`, which the buttons' arrival doesn't change). On a full page load that can leave
  // an already-in-view tab pushed back out by the buttons' combined width. Once the scroller's own
  // size settles, nudge the active tab back into view ourselves — by moving only the scroller
  // horizontally: `scrollIntoView` (even with `block: 'nearest'`) can also scroll the page.
  // That animation is still running when the buttons arrive, and writes its stale target on every
  // frame until it ends (`transitions.duration.standard`, 300 ms), undoing the nudge: on a 375 px
  // full load of a four-tab record the strip stayed at scrollLeft 39 of 119. So nudge once more
  // when it is over (350 ms after the scroller's size last changed).
  useEffect(() => {
    if (active === false) return undefined;
    const scroller = navRef.current?.querySelector<HTMLElement>(`.${tabsClasses.scroller}`);
    if (!scroller) return undefined;
    const scrollActiveTabIntoView = () => {
      const tab = scroller.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return;
      const view = scroller.getBoundingClientRect();
      const rect = tab.getBoundingClientRect();
      if (rect.left < view.left) {
        scroller.scrollLeft -= view.left - rect.left;
      } else if (rect.right > view.right) {
        scroller.scrollLeft += rect.right - view.right;
      }
    };
    let afterAnimation: number | undefined;
    const settle = () => {
      scrollActiveTabIntoView();
      window.clearTimeout(afterAnimation);
      afterAnimation = window.setTimeout(scrollActiveTabIntoView, SCROLL_ANIMATION_MS);
    };
    try {
      const observer = new ResizeObserver(settle);
      observer.observe(scroller);
      return () => {
        observer.disconnect();
        window.clearTimeout(afterAnimation);
      };
    } catch {
      // ponytail: jsdom (unit tests) has no ResizeObserver; every real browser does.
      return undefined;
    }
  }, [active]);

  return (
    <Box component="nav" aria-label={label} ref={navRef} sx={{ mt: 3.5, mb: 4 }}>
      <Tabs value={active} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        {tabs.map((tab) => (
          <Tab
            key={tab.href}
            value={tab.href}
            label={tab.label}
            component={NextLink}
            href={tab.href}
            aria-current={tab.href === active ? 'page' : undefined}
          />
        ))}
      </Tabs>
    </Box>
  );
}
