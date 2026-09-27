'use client';

import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import NextLink from '@/components/navigation/next-link';

export interface RecordTab {
  /** A nested route; the record root is the Overview tab. */
  href: string;
  label: string;
}

interface RecordTabsProps {
  /** Names the navigation landmark and its tab list, e.g. `Westlands Branch sections`. */
  label: string;
  tabs: readonly RecordTab[];
}

/** The deepest tab whose href is the current path or an ancestor of it (sub-routes keep their
 * tab; the record root only matches Overview). */
function activeTab(tabs: readonly RecordTab[], pathname: string): string | false {
  let active: string | false = false;
  for (const tab of tabs) {
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
  return (
    <Box component="nav" aria-label={label} sx={{ mt: 3.5, mb: 4 }}>
      <Tabs
        value={active}
        aria-label={label}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
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
