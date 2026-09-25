# PR 04: Application Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Read the [plan index](./2026-09-25-admin-parity-00-index.md)
> first.

**Goal:** Rebuild the global shell to the prototype: full-height navy collapsible rail, dense
68 px app bar, footer, page header — with permission-filtered navigation — and remove every
placeholder page and sample-data card.

**Architecture:** `AppShell` (client) owns the rail and app bar for every authenticated page; the
server layout passes only serializable data (user DTO, typed context, collapse preference from a
cookie). Navigation items stay module-owned (`modules/*/…-navigation.ts`) and are imported by the
client shell, filtered with `visibleNavigationItems`. Pages use a server-renderable `PageHeader`.

**Tech Stack:** MUI 9.4 (`Drawer` permanent/temporary, `AppBar`, `ListItemButton`, `Tooltip`,
`Avatar`), Next.js 16 (`cookies()`), Vitest + RTL, Playwright + axe.

**Spec:** [`…-design.md`](../specs/2026-09-25-admin-prototype-parity-design.md) §8 (shell,
navigation), §9 (page header), D4, D7; §7.2 metrics.

## Global Constraints

See the index. Additionally:

- The context button links to `/select-context?next=<current path>` in this layer; PR 05 turns it
  into the dialog. The workspace label is a non-interactive label here; PR 05 turns it into the app
  switcher button. Do not build either early.
- No notifications button in this layer (it would have no function); PR 12 adds a working one.
- Navigation lists only implemented pages; each later layer adds its own item.

## Review Focus

Pins index item 4 (long values at narrow widths) — Task 6's mobile spec uses a long-names scenario.

---

### Task 1: Permission helpers and filtered, module-owned navigation

**Files:**

- Create: `auth/permissions.ts`, `auth/permissions.test.ts`
- Modify: `components/shell/workspace-navigation.tsx` (full rewrite)
- Create: `components/shell/workspace-navigation.test.tsx`
- Modify: `modules/administration/administration-navigation.ts` (full rewrite)
- Modify: `modules/platform-administration/platform-administration-navigation.ts` (full rewrite)

**Interfaces:**

- Produces:
  - `can(holder: { permissions: readonly string[] }, code: string): boolean`, `canAll(holder,
codes)`, `canAny(holder, codes)` — client-safe (no `server-only`).
  - `interface WorkspaceNavigationItem { href: string; label: string; icon: ElementType;
requiresAny?: readonly string[] }`
  - `visibleNavigationItems(items, permissions): WorkspaceNavigationItem[]`
  - `isNavigationItemActive(pathname, href): boolean`
  - `WorkspaceNavigation({ items, ariaLabel, collapsed?, onNavigate? })` — navy rail styling.
  - `administrationNavigationItems` (Overview only), `platformAdministrationNavigationItems`
    (Overview; SACCO institutions gated by `tenant.view`). Later layers append to these arrays.

- [ ] **Step 1: Write the failing permission tests**

`auth/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { can, canAll, canAny } from './permissions';

const holder = { permissions: ['user.view', 'role.view'] };

describe('permission helpers', () => {
  it('checks a single code', () => {
    expect(can(holder, 'user.view')).toBe(true);
    expect(can(holder, 'user.invite')).toBe(false);
  });

  it('requires every code for canAll and any code for canAny', () => {
    expect(canAll(holder, ['user.view', 'role.view'])).toBe(true);
    expect(canAll(holder, ['user.view', 'user.invite'])).toBe(false);
    expect(canAny(holder, ['user.invite', 'role.view'])).toBe(true);
    expect(canAny(holder, ['user.invite'])).toBe(false);
  });

  it('treats an empty requirement list as satisfied for canAll and unsatisfied for canAny', () => {
    expect(canAll(holder, [])).toBe(true);
    expect(canAny(holder, [])).toBe(false);
  });
});
```

Run: `pnpm test:run auth/permissions.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `auth/permissions.ts`**

```ts
/**
 * Permission checks over the sanitized FinaxisUser's effective permission codes (from
 * `/auth/me` for the active context). UI gating only — the backend remains the authority.
 * Client-safe: no server-only imports.
 */
export interface PermissionHolder {
  permissions: readonly string[];
}

export function can(holder: PermissionHolder, code: string): boolean {
  return holder.permissions.includes(code);
}

export function canAll(holder: PermissionHolder, codes: readonly string[]): boolean {
  return codes.every((code) => can(holder, code));
}

export function canAny(holder: PermissionHolder, codes: readonly string[]): boolean {
  return codes.some((code) => can(holder, code));
}
```

Run: `pnpm test:run auth/permissions.test.ts` → PASS.

- [ ] **Step 3: Write the failing navigation tests**

`components/shell/workspace-navigation.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import { renderWithProviders } from '@/test/test-utils';
import {
  isNavigationItemActive,
  visibleNavigationItems,
  WorkspaceNavigation,
  type WorkspaceNavigationItem,
} from './workspace-navigation';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/platform-admin/tenants/abc' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/platform-admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/platform-admin/tenants',
    label: 'SACCO institutions',
    icon: DomainOutlined,
    requiresAny: ['tenant.view'],
  },
];

describe('visibleNavigationItems', () => {
  it('keeps ungated items and items whose permission the user holds', () => {
    expect(visibleNavigationItems(ITEMS, ['tenant.view']).map((item) => item.label)).toEqual([
      'Overview',
      'SACCO institutions',
    ]);
    expect(visibleNavigationItems(ITEMS, []).map((item) => item.label)).toEqual(['Overview']);
  });
});

describe('isNavigationItemActive', () => {
  it('matches exact paths and nested paths below multi-segment items', () => {
    expect(isNavigationItemActive('/platform-admin', '/platform-admin')).toBe(true);
    expect(isNavigationItemActive('/platform-admin/tenants/abc', '/platform-admin/tenants')).toBe(
      true,
    );
    expect(isNavigationItemActive('/platform-admin/tenants', '/platform-admin')).toBe(false);
  });
});

describe('WorkspaceNavigation', () => {
  it('marks the active item and labels the landmark', () => {
    renderWithProviders(<WorkspaceNavigation items={ITEMS} ariaLabel="Platform administration" />);

    const nav = screen.getByRole('navigation', { name: 'Platform administration' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SACCO institutions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('keeps accessible names when collapsed to icons', () => {
    renderWithProviders(
      <WorkspaceNavigation items={ITEMS} ariaLabel="Platform administration" collapsed />,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByText('SACCO institutions')).not.toBeInTheDocument();
  });
});
```

Run: `pnpm test:run components/shell/workspace-navigation.test.tsx` → FAIL (`visibleNavigationItems`
not exported).

- [ ] **Step 4: Rewrite `components/shell/workspace-navigation.tsx`**

```tsx
'use client';

import type { ElementType } from 'react';
import { usePathname } from 'next/navigation';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import NextLink from '@/components/navigation/next-link';

export interface WorkspaceNavigationItem {
  href: string;
  label: string;
  icon: ElementType;
  /** Shown when the user holds any of these permission codes; omit for always-visible items. */
  requiresAny?: readonly string[];
}

export function visibleNavigationItems(
  items: readonly WorkspaceNavigationItem[],
  permissions: readonly string[],
): WorkspaceNavigationItem[] {
  return items.filter(
    (item) => !item.requiresAny || item.requiresAny.some((code) => permissions.includes(code)),
  );
}

export function isNavigationItemActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }

  const hrefSegments = href.split('/').filter(Boolean);
  if (href === '/' || hrefSegments.length <= 1) {
    return false;
  }

  return pathname.startsWith(`${href}/`);
}

interface WorkspaceNavigationProps {
  items: readonly WorkspaceNavigationItem[];
  ariaLabel: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Rail navigation on the navy brand surface (prototype `.sidebar nav`). */
export function WorkspaceNavigation({
  items,
  ariaLabel,
  collapsed = false,
  onNavigate,
}: WorkspaceNavigationProps) {
  const pathname = usePathname();

  return (
    <List component="nav" aria-label={ariaLabel} sx={{ flex: 1, overflowY: 'auto', py: 3 }}>
      {items.map((item) => {
        const isActive = isNavigationItemActive(pathname, item.href);
        const button = (
          <ListItemButton
            key={item.href}
            component={NextLink}
            href={item.href}
            selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            sx={(theme) => ({
              height: collapsed ? 56 : 54,
              mx: collapsed ? 2.5 : 0,
              my: collapsed ? 1 : 0,
              px: collapsed ? 0 : 5.5,
              gap: 3.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: collapsed ? '7px' : 0,
              borderLeft: collapsed ? 0 : '3px solid transparent',
              color: theme.vars.palette.brand.onNavyMuted,
              '&:hover': {
                backgroundColor: theme.vars.palette.brand.onNavySurface,
                color: theme.vars.palette.brand.onNavy,
              },
              '&.Mui-selected, &.Mui-selected:hover': {
                color: theme.vars.palette.brand.onNavy,
                backgroundColor: 'transparent',
                backgroundImage: theme.vars.palette.brand.railActive,
                borderLeftColor: theme.vars.palette.brand.railMarker,
                boxShadow: collapsed
                  ? `inset 3px 0 ${theme.vars.palette.brand.railMarker}`
                  : 'none',
              },
              '&.Mui-focusVisible': {
                outline: `2px solid ${theme.vars.palette.brand.railMarker}`,
                outlineOffset: -2,
              },
            })}
          >
            <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
              <item.icon sx={{ fontSize: 22 }} />
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: {
                    noWrap: true,
                    sx: { fontSize: '0.875rem', fontWeight: isActive ? 700 : 500 },
                  },
                }}
              />
            )}
          </ListItemButton>
        );

        return collapsed ? (
          <Tooltip key={item.href} title={item.label} placement="right">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </List>
  );
}
```

- [ ] **Step 5: Rewrite the module navigation files**

`modules/administration/administration-navigation.ts`:

```ts
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

/**
 * Tenant Administration navigation. Each stack layer appends its page here when it ships
 * (Approval queue, Users & access, Branches, Roles & permissions, Settings, Business date,
 * Audit trail — spec §8), with `requiresAny` set to the page's read permission.
 */
export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
];
```

`modules/platform-administration/platform-administration-navigation.ts`:

```ts
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

export const platformAdministrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/platform-admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/platform-admin/tenants',
    label: 'SACCO institutions',
    icon: DomainOutlined,
    requiresAny: ['tenant.view'],
  },
];
```

- [ ] **Step 6: Run the tests and commit**

Run: `pnpm test:run auth/permissions.test.ts components/shell/workspace-navigation.test.tsx`
Expected: PASS. (Other shell tests still reference the old drawer — fixed in Task 2.)

```bash
git add auth/permissions.ts auth/permissions.test.ts components/shell/workspace-navigation.tsx \
  components/shell/workspace-navigation.test.tsx modules/administration/administration-navigation.ts \
  modules/platform-administration/platform-administration-navigation.ts
git commit -m "$(cat <<'EOF'
feat(shell): add permission helpers and permission-filtered rail navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Navy rail (drawer) with a persisted collapse preference

**Files:**

- Create: `components/shell/navigation-preferences.ts`
- Modify: `components/shell/workspace-drawer.tsx` (full rewrite)
- Modify: `components/shell/workspace-drawer.test.tsx` (full rewrite)

**Interfaces:**

- Consumes: Task 1 `WorkspaceNavigation`, `WorkspaceNavigationItem`; `FinaxisLogo`.
- Produces:
  - `NAV_COLLAPSED_COOKIE = 'finaxis_nav'`, `NAV_COLLAPSED_VALUE = 'collapsed'`,
    `writeNavCollapsed(collapsed: boolean): void` (no `'use client'` directive — the server layout
    imports the constants).
  - `RAIL_EXPANDED_WIDTH = 232`, `RAIL_COLLAPSED_WIDTH = 76`.
  - `WorkspaceDrawer({ items, navigationAriaLabel, collapsed, onToggleCollapsed, mobileOpen,
onMobileClose, footerTitle, footerSubtitle })`.

- [ ] **Step 1: Load skills**

Invoke `frontend-design` and `ui-ux-pro-max`; run the index's design-system command with
`"navigation rail"` as the screen, plus
`--domain ux "collapsible sidebar navigation keyboard"`. Keep the prototype anatomy (spec §8).

- [ ] **Step 2: Write the failing drawer tests**

`components/shell/workspace-drawer.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import { renderWithProviders } from '@/test/test-utils';
import { WorkspaceDrawer } from './workspace-drawer';
import type { WorkspaceNavigationItem } from './workspace-navigation';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin/users' };
});

const ITEMS: WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
  { href: '/admin/users', label: 'Users & access', icon: GroupOutlined },
];

function renderDrawer(overrides: Partial<Parameters<typeof WorkspaceDrawer>[0]> = {}) {
  const props = {
    items: ITEMS,
    navigationAriaLabel: 'Administration',
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    mobileOpen: false,
    onMobileClose: vi.fn(),
    footerTitle: 'Umoja Teachers SACCO',
    footerSubtitle: 'Westlands Branch',
    ...overrides,
  };
  renderWithProviders(<WorkspaceDrawer {...props} />);
  return props;
}

describe('WorkspaceDrawer', () => {
  it('shows the brand, the active item, and the organisation footer', () => {
    renderDrawer();

    expect(screen.getAllByText('Finaxis').length).toBeGreaterThan(0);
    const nav = screen.getAllByRole('navigation', { name: 'Administration' })[0];
    if (!nav) throw new Error('navigation landmark missing');
    expect(within(nav).getByRole('link', { name: 'Users & access' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByText('Umoja Teachers SACCO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Westlands Branch').length).toBeGreaterThan(0);
  });

  it('asks to collapse and expand through an accessible control', async () => {
    const user = userEvent.setup();
    const props = renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders an icon rail with an expand control when collapsed', () => {
    renderDrawer({ collapsed: true });

    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes the mobile drawer on Escape', async () => {
    const user = userEvent.setup();
    const props = renderDrawer({ mobileOpen: true });

    await user.keyboard('{Escape}');
    expect(props.onMobileClose).toHaveBeenCalled();
  });
});
```

Run: `pnpm test:run components/shell/workspace-drawer.test.tsx` → FAIL (old props).

- [ ] **Step 3: Implement `components/shell/navigation-preferences.ts`**

```ts
/**
 * The rail's collapse preference, persisted in a cookie (not localStorage) so the server renders
 * the right width on first paint. Read in app/(authenticated)/layout.tsx; written by AppShell.
 * No 'use client' directive: the server layout imports the constants.
 */
export const NAV_COLLAPSED_COOKIE = 'finaxis_nav';
export const NAV_COLLAPSED_VALUE = 'collapsed';

export function writeNavCollapsed(collapsed: boolean): void {
  document.cookie = collapsed
    ? `${NAV_COLLAPSED_COOKIE}=${NAV_COLLAPSED_VALUE}; path=/; max-age=31536000; samesite=lax`
    : `${NAV_COLLAPSED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
```

- [ ] **Step 4: Rewrite `components/shell/workspace-drawer.tsx`**

```tsx
'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Drawer from '@mui/material/Drawer';
import type { PaperProps } from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import { WorkspaceNavigation, type WorkspaceNavigationItem } from './workspace-navigation';

export const RAIL_EXPANDED_WIDTH = 232;
export const RAIL_COLLAPSED_WIDTH = 76;
const MOBILE_WIDTH = 250;

interface WorkspaceDrawerProps {
  items: readonly WorkspaceNavigationItem[];
  navigationAriaLabel: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  footerTitle: string;
  footerSubtitle: string;
}

function railPaper(width: number): PaperProps {
  return {
    sx: (theme) => ({
      width,
      border: 0,
      overflowX: 'hidden',
      color: theme.vars.palette.brand.onNavy,
      backgroundColor: theme.vars.palette.brand.navy,
      backgroundImage: `linear-gradient(180deg, ${theme.vars.palette.brand.deep}, ${theme.vars.palette.brand.navy})`,
      transition: theme.transitions.create('width', { duration: theme.transitions.duration.short }),
    }),
  };
}

function RailBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Box
      sx={{
        height: 86,
        flexShrink: 0,
        px: 4.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 2.5,
        borderBottom: 1,
        borderColor: 'brand.onNavyBorder',
      }}
    >
      <FinaxisLogo size={collapsed ? 40 : 38} />
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1, color: 'brand.onNavy' }}
          >
            Finaxis
          </Typography>
          <Typography
            component="p"
            noWrap
            sx={{ mt: 1.5, fontSize: '0.625rem', color: 'brand.onNavyMuted' }}
          >
            People · Savings · Progress
          </Typography>
        </Box>
      )}
    </Box>
  );
}

interface RailContentProps {
  items: readonly WorkspaceNavigationItem[];
  navigationAriaLabel: string;
  collapsed: boolean;
  footerTitle: string;
  footerSubtitle: string;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}

function RailContent({
  items,
  navigationAriaLabel,
  collapsed,
  footerTitle,
  footerSubtitle,
  onNavigate,
  onToggleCollapsed,
}: RailContentProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <RailBrand collapsed={collapsed} />
      <WorkspaceNavigation
        items={items}
        ariaLabel={navigationAriaLabel}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {onToggleCollapsed && (
        <ButtonBase
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          sx={(theme) => ({
            mx: collapsed ? 5 : 4.5,
            height: 52,
            flexShrink: 0,
            gap: 3.5,
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: theme.vars.palette.brand.onNavyMuted,
            borderTop: `1px solid ${theme.vars.palette.brand.onNavyBorder}`,
            borderBottom: `1px solid ${theme.vars.palette.brand.onNavyBorder}`,
            fontSize: '0.8125rem',
            '&:hover': { color: theme.vars.palette.brand.onNavy },
          })}
        >
          {collapsed ? (
            <ChevronRightOutlined fontSize="small" />
          ) : (
            <ChevronLeftOutlined fontSize="small" />
          )}
          {!collapsed && <span>Collapse navigation</span>}
        </ButtonBase>
      )}
      <Box
        sx={{
          minHeight: 90,
          flexShrink: 0,
          px: 5.5,
          py: 4.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 3.5,
          color: 'brand.onNavyMuted',
        }}
      >
        <GroupsOutlined fontSize="small" aria-hidden="true" />
        {!collapsed && (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="p"
              noWrap
              title={footerTitle}
              sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'brand.onNavy' }}
            >
              {footerTitle}
            </Typography>
            <Typography
              component="p"
              noWrap
              title={footerSubtitle}
              sx={{ mt: 1, fontSize: '0.625rem', color: 'brand.onNavyMuted' }}
            >
              {footerSubtitle}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Full-height navy rail: permanent (mini variant) from `md`, temporary drawer below. */
export function WorkspaceDrawer({
  items,
  navigationAriaLabel,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
  footerTitle,
  footerSubtitle,
}: WorkspaceDrawerProps) {
  const width = collapsed ? RAIL_COLLAPSED_WIDTH : RAIL_EXPANDED_WIDTH;

  return (
    <>
      <Drawer
        variant="permanent"
        sx={(theme) => ({
          display: { xs: 'none', md: 'block' },
          width,
          flexShrink: 0,
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.short,
          }),
        })}
        slotProps={{ paper: railPaper(width) }}
      >
        <RailContent
          items={items}
          navigationAriaLabel={navigationAriaLabel}
          collapsed={collapsed}
          footerTitle={footerTitle}
          footerSubtitle={footerSubtitle}
          onToggleCollapsed={onToggleCollapsed}
        />
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' } }}
        slotProps={{ paper: railPaper(MOBILE_WIDTH) }}
      >
        <ButtonBase
          onClick={onMobileClose}
          sx={{ alignSelf: 'flex-start', m: 2, p: 2, gap: 1.75, color: 'brand.onNavy' }}
        >
          <CloseOutlined fontSize="small" aria-hidden="true" />
          Close
        </ButtonBase>
        <RailContent
          items={items}
          navigationAriaLabel={navigationAriaLabel}
          collapsed={false}
          footerTitle={footerTitle}
          footerSubtitle={footerSubtitle}
          onNavigate={onMobileClose}
        />
      </Drawer>
    </>
  );
}
```

- [ ] **Step 5: Run the tests and commit**

Run: `pnpm test:run components/shell/workspace-drawer.test.tsx components/shell/workspace-navigation.test.tsx`
Expected: PASS.

```bash
git add components/shell/navigation-preferences.ts components/shell/workspace-drawer.tsx \
  components/shell/workspace-drawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(shell): add the full-height navy rail with a collapsible mini variant

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: App bar, account trigger, footer, and page header

**Files:**

- Modify: `components/shell/global-header.tsx` (full rewrite), `global-header.test.tsx` (full rewrite)
- Modify: `components/shell/user-menu.tsx` (trigger only — see step 5)
- Create: `components/shell/app-footer.tsx`
- Create: `components/shell/page-header.tsx`, `components/shell/page-header.test.tsx`

**Interfaces:**

- Produces:
  - `GlobalHeader({ user: FinaxisUser, onOpenNavigation: () => void })`.
  - `AppFooter()`.
  - `PageHeader({ eyebrow?: string; title: string; description?: string; actions?: ReactNode })` —
    Server-Component-safe (no hooks, no `'use client'`); renders the page's only `h1`.

- [ ] **Step 1: Write the failing header and page-header tests**

`components/shell/global-header.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { GlobalHeader } from './global-header';
import { ApplicationContextProvider } from './organization-context';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/admin' };
});

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  permissions: [],
  roles: [],
  branches: [],
};

const CONTEXT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Umoja Teachers SACCO' },
  branch: { id: 'branch-1', name: 'Westlands Branch' },
};

function renderHeader(onOpenNavigation = vi.fn()) {
  renderWithProviders(
    <ApplicationContextProvider value={CONTEXT}>
      <GlobalHeader user={USER} onOpenNavigation={onOpenNavigation} />
    </ApplicationContextProvider>,
  );
  return onOpenNavigation;
}

describe('GlobalHeader', () => {
  it('shows the workspace, organisation, branch, and account identity', () => {
    renderHeader();

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Umoja Teachers SACCO')).toBeInTheDocument();
    expect(screen.getByText('Westlands Branch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jane Muthoni' })).toBeInTheDocument();
  });

  it('links the context control to context selection, returning to the current page', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: /switch organisation or branch/i })).toHaveAttribute(
      'href',
      '/select-context?next=%2Fadmin',
    );
  });

  it('opens the mobile navigation', async () => {
    const user = userEvent.setup();
    const onOpenNavigation = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onOpenNavigation).toHaveBeenCalledTimes(1);
  });

  it('keeps the theme and app-switcher controls and has no placeholder notifications', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch application/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
  });
});
```

`components/shell/page-header.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Button from '@mui/material/Button';
import { renderWithProviders } from '@/test/test-utils';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the eyebrow, a single h1, the description, and actions', () => {
    renderWithProviders(
      <PageHeader
        eyebrow="Administration"
        title="Users & access"
        description="Create staff identities and govern access."
        actions={<Button>Invite user</Button>}
      />,
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Users & access' })).toBeInTheDocument();
    expect(screen.getByText('Create staff identities and govern access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });

  it('renders only the title when nothing else is given', () => {
    renderWithProviders(<PageHeader title="Overview" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});
```

Run: `pnpm test:run components/shell/global-header.test.tsx components/shell/page-header.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Rewrite `components/shell/global-header.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NextLink from '@/components/navigation/next-link';
import type { FinaxisUser } from '@/auth/auth.types';
import { AppSwitcher } from './app-switcher';
import { ThemeModeMenu } from './theme-mode-menu';
import { UserMenu } from './user-menu';
import { useApplicationContext } from './organization-context';

interface GlobalHeaderProps {
  user: FinaxisUser;
  onOpenNavigation: () => void;
}

/** 68 px app bar (prototype `.topbar`): workspace, context, then global controls. */
export function GlobalHeader({ user, onOpenNavigation }: GlobalHeaderProps) {
  const { module, organization, branch } = useApplicationContext();
  const pathname = usePathname();

  return (
    <AppBar position="sticky">
      <Toolbar disableGutters sx={{ minHeight: 68, height: 68, gap: 3, px: { xs: 2.5, md: 4.5 } }}>
        <IconButton
          aria-label="Open navigation"
          onClick={onOpenNavigation}
          sx={{ display: { md: 'none' } }}
        >
          <MenuOutlined />
        </IconButton>

        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 2.5,
            height: 46,
            px: 3,
            flexShrink: 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'surfaces.secondary',
          }}
        >
          <AppsOutlined fontSize="small" aria-hidden="true" />
          <Typography variant="subtitle2" component="span" noWrap sx={{ fontWeight: 700 }}>
            {module.name}
          </Typography>
        </Box>

        <Button
          component={NextLink}
          href={`/select-context?next=${encodeURIComponent(pathname)}`}
          color="inherit"
          aria-label={`Switch organisation or branch. Current: ${organization.name}, ${branch.name}`}
          sx={{ minWidth: 0, height: 46, gap: 2.5, px: 2, color: 'text.primary' }}
        >
          <DomainOutlined aria-hidden="true" />
          <Box
            component="span"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              flexDirection: 'column',
              alignItems: 'flex-start',
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            <Typography
              component="span"
              variant="subtitle2"
              noWrap
              sx={{ fontWeight: 700, maxWidth: { sm: 160, lg: 260 } }}
            >
              {organization.name}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ maxWidth: { sm: 160, lg: 260 } }}
            >
              {branch.name}
            </Typography>
          </Box>
          <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <AppSwitcher />
          <ThemeModeMenu />
          <UserMenu user={user} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
```

- [ ] **Step 3: Implement `components/shell/page-header.tsx`**

```tsx
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page heading (prototype `.page-heading`): eyebrow, the page's only h1, description, and
 * right-aligned actions. Server-Component-safe — pass actions as elements, never callbacks.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: 5,
        mb: 5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" component="p" color="text.secondary">
            {eyebrow}
          </Typography>
        )}
        <Typography component="h1" variant="h1" sx={{ mt: 1, mb: 1.25 }}>
          {title}
        </Typography>
        {description && (
          <Typography color="text.secondary" sx={{ maxWidth: 730 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  );
}
```

- [ ] **Step 4: Implement `components/shell/app-footer.tsx`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        minHeight: 64,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: { xs: 'center', md: 'space-between' },
        gap: 3,
        px: { xs: 3.5, md: 6 },
        py: 3,
        color: 'text.secondary',
        textAlign: { xs: 'center', md: 'left' },
      }}
    >
      <Typography variant="caption">
        © {new Date().getFullYear()} Finaxis. Open for a stronger cooperative tomorrow.
      </Typography>
      <Typography variant="caption">Built for African cooperatives</Typography>
    </Box>
  );
}
```

(The prototype's "Regulated · Secure · Compliant" line is a compliance claim the product hasn't
made; left out unless the user supplies approved copy.)

- [ ] **Step 5: Restyle the account trigger in `components/shell/user-menu.tsx`**

Replace the trigger `<Button …>…</Button>` (the first child of the fragment) with:

```tsx
<Button
  aria-label={user.name}
  aria-controls={open ? menuId : undefined}
  aria-haspopup="true"
  aria-expanded={open ? 'true' : undefined}
  onClick={handleOpen}
  color="inherit"
  sx={{ gap: 2.5, px: 1, height: 46, minWidth: 0 }}
>
  <Avatar src={user.image} sx={{ width: 38, height: 38, fontSize: '0.8125rem' }}>
    {!user.image && initialsOf(user.name)}
  </Avatar>
  <Box
    component="span"
    sx={{
      display: { xs: 'none', lg: 'flex' },
      flexDirection: 'column',
      alignItems: 'flex-start',
      minWidth: 0,
      textAlign: 'left',
    }}
  >
    <Typography component="span" variant="subtitle2" noWrap sx={{ fontWeight: 700, maxWidth: 180 }}>
      {user.name}
    </Typography>
    <Typography
      component="span"
      variant="caption"
      color="text.secondary"
      noWrap
      sx={{ maxWidth: 180 }}
    >
      {user.email}
    </Typography>
  </Box>
  <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
</Button>
```

The menu body (identity header, profile link, logout form) is unchanged. Run
`pnpm test:run components/shell/user-menu.test.tsx`; if a test asserted the old visible-name
element, update it to query `getByRole('button', { name: user.name })`.

- [ ] **Step 6: Run the tests and commit**

Run: `pnpm test:run components/shell`
Expected: header, page-header, drawer, navigation, user-menu, theme-menu, app-switcher tests PASS.
`app-shell.test.tsx` may fail until Task 4.

```bash
git add components/shell/global-header.tsx components/shell/global-header.test.tsx \
  components/shell/user-menu.tsx components/shell/user-menu.test.tsx components/shell/app-footer.tsx \
  components/shell/page-header.tsx components/shell/page-header.test.tsx
git commit -m "$(cat <<'EOF'
feat(shell): add the dense app bar, account trigger, footer, and page header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Compose the shell and wire the layout

**Files:**

- Modify: `components/shell/app-shell.tsx` (full rewrite), `app-shell.test.tsx` (full rewrite)
- Modify: `app/(authenticated)/layout.tsx`, `app/(authenticated)/layout.test.tsx`
- Modify: `app/(authenticated)/platform-admin/layout.tsx`, `…/platform-admin/layout.test.tsx`
- Delete: `app/(authenticated)/admin/layout.tsx`, `app/(authenticated)/admin/layout.test.tsx`,
  `modules/platform-administration/components/platform-workspace-shell.tsx`,
  `components/shell/mobile-navigation-button.tsx`, `components/shell/notification-button.tsx`,
  `components/shell/notification-button.test.tsx`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: `AppShell({ user, context, initialNavCollapsed: boolean, children })`.

- [ ] **Step 1: Write the failing shell test**

`components/shell/app-shell.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { AppShell } from './app-shell';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => '/platform-admin' };
});

const USER: FinaxisUser = {
  id: 'user-1',
  name: 'Jane Muthoni',
  email: 'jane.muthoni@finaxis.test',
  permissions: [],
  roles: [],
  branches: [],
};

const PLATFORM: ApplicationContext = {
  module: { id: 'platform-administration', name: 'Platform Administration' },
  organization: { id: 'platform', name: 'Platform' },
  branch: { id: 'ops', name: 'Platform Operations' },
};

describe('AppShell', () => {
  it('renders the module navigation filtered by permissions, the page, and the footer', () => {
    renderWithProviders(
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
        <div>Page content</div>
      </AppShell>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Overview' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'SACCO institutions' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Finaxis');
  });

  it('shows gated items when the user holds the permission', () => {
    renderWithProviders(
      <AppShell
        user={{ ...USER, permissions: ['tenant.view'] }}
        context={PLATFORM}
        initialNavCollapsed={false}
      >
        <div />
      </AppShell>,
    );

    expect(screen.getAllByRole('link', { name: 'SACCO institutions' }).length).toBeGreaterThan(0);
  });

  it('persists the collapse preference in a cookie', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell user={USER} context={PLATFORM} initialNavCollapsed={false}>
        <div />
      </AppShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    expect(document.cookie).toContain('finaxis_nav=collapsed');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });
});
```

Run: `pnpm test:run components/shell/app-shell.test.tsx` → FAIL.

- [ ] **Step 2: Rewrite `components/shell/app-shell.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { FinaxisUser } from '@/auth/auth.types';
import type { ApplicationContext } from '@/config/application-context';
import { administrationNavigationItems } from '@/modules/administration/administration-navigation';
import { platformAdministrationNavigationItems } from '@/modules/platform-administration/platform-administration-navigation';
import { AppFooter } from './app-footer';
import { GlobalHeader } from './global-header';
import { writeNavCollapsed } from './navigation-preferences';
import { ApplicationContextProvider } from './organization-context';
import { WorkspaceDrawer } from './workspace-drawer';
import { visibleNavigationItems } from './workspace-navigation';

const NAVIGATION = {
  administration: administrationNavigationItems,
  'platform-administration': platformAdministrationNavigationItems,
} as const;

interface AppShellProps {
  user: FinaxisUser;
  context: ApplicationContext;
  initialNavCollapsed: boolean;
  children: ReactNode;
}

/**
 * Global authenticated shell. Navigation registries are imported here (client side) because nav
 * items carry icon components, which cannot cross the Server → Client boundary.
 */
export function AppShell({ user, context, initialNavCollapsed, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(initialNavCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = visibleNavigationItems(NAVIGATION[context.module.id], user.permissions);

  return (
    <ApplicationContextProvider value={context}>
      <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
        <WorkspaceDrawer
          items={items}
          navigationAriaLabel={context.module.name}
          collapsed={collapsed}
          onToggleCollapsed={() => {
            const next = !collapsed;
            setCollapsed(next);
            writeNavCollapsed(next);
          }}
          mobileOpen={mobileOpen}
          onMobileClose={() => {
            setMobileOpen(false);
          }}
          footerTitle={context.organization.name}
          footerSubtitle={context.branch.name}
        />
        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <GlobalHeader
            user={user}
            onOpenNavigation={() => {
              setMobileOpen(true);
            }}
          />
          <Box component="main" sx={{ flexGrow: 1, px: { xs: 3.5, md: 6 }, pt: 5, pb: 4 }}>
            {children}
          </Box>
          <AppFooter />
        </Box>
      </Box>
    </ApplicationContextProvider>
  );
}
```

- [ ] **Step 3: Pass the collapse preference from `app/(authenticated)/layout.tsx`**

```tsx
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { getSelectedContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { AppShell } from '@/components/shell/app-shell';
import {
  NAV_COLLAPSED_COOKIE,
  NAV_COLLAPSED_VALUE,
} from '@/components/shell/navigation-preferences';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const sessionUser = await getAuthenticatedUser(requestHeaders);

  if (!sessionUser) {
    redirect('/login?reason=session_expired');
  }

  const selectedContext = await getSelectedContextProfile(requestHeaders);
  if (selectedContext.kind !== 'resolved') {
    redirect(contextSelectionRedirectPath(requestHeaders));
  }

  const navCollapsed = (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === NAV_COLLAPSED_VALUE;

  return (
    <AppShell
      user={profileToFinaxisUser(selectedContext.profile, sessionUser)}
      context={selectedContext.context}
      initialNavCollapsed={navCollapsed}
    >
      {children}
    </AppShell>
  );
}
```

In `app/(authenticated)/layout.test.tsx`: extend the `next/headers` mock with
`cookies: vi.fn(() => Promise.resolve({ get: () => undefined }))`, add `initialNavCollapsed: false`
to the `renderedShell` expectation object (capture it in the `AppShell` mock:
`renderedShell({ context, user, initialNavCollapsed })`), and add one test:

```tsx
it('passes a collapsed rail preference from the cookie', async () => {
  const { cookies } = await import('next/headers');
  vi.mocked(cookies).mockResolvedValueOnce({
    get: (name: string) => (name === 'finaxis_nav' ? { name, value: 'collapsed' } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
  getAuthenticatedUser.mockResolvedValueOnce({
    id: 'user-1',
    name: 'Jane Muthoni',
    email: 'jane.muthoni@finaxis.test',
    roles: [],
    branches: [],
  });
  getSelectedContextProfile.mockResolvedValueOnce({
    context: {
      branch: { id: 'branch-1', name: 'Headquarters' },
      module: { id: 'administration', name: 'Administration' },
      organization: { id: 'organisation-1', name: 'Finaxis Holdings' },
    },
    kind: 'resolved',
    profile: {
      user_id: 'u',
      full_name: 'Jane',
      email: 'j@x',
      branches: [],
      roles: [],
      permissions: [],
    },
  });

  render(await AuthenticatedLayout({ children: <div /> }));

  expect(renderedShell).toHaveBeenCalledWith(
    expect.objectContaining({ initialNavCollapsed: true }),
  );
});
```

- [ ] **Step 4: Reduce the platform layout to its guard**

`app/(authenticated)/platform-admin/layout.tsx`: remove the `PlatformWorkspaceShell` import and
return `<>{children}</>` after the two guards. In its test, rename the first case to "renders
children for a platform context", assert `screen.getByText('Tenant detail')`, and delete the
navigation assertions (the shell test covers navigation). Delete the files listed under "Delete".

- [ ] **Step 5: Run the tests and commit**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS (remaining failures belong to Task 5's page migrations if `SectionHeading` or
placeholder pages are still referenced — finish Task 5 before committing if so).

```bash
git add -A components/shell app/\(authenticated\) modules/platform-administration/components
git commit -m "$(cat <<'EOF'
feat(shell): compose the rail and app bar into a global shell with a persisted rail preference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Remove placeholders and sample data; migrate headings

**Files:**

- Delete: `app/(authenticated)/admin/{users,branches,roles,settings,audit}/page.tsx`,
  `components/shell/section-heading.tsx`, `section-heading.test.tsx`,
  `components/shell/placeholder-section.tsx`, `placeholder-section.test.tsx`
- Modify: `app/(authenticated)/admin/page.tsx`, `app/(authenticated)/admin/page.test.tsx`
- Modify: `components/profile/profile-view.tsx` (heading only), its test if it asserted breadcrumbs
- Modify: `modules/platform-administration/components/platform-page-shell.tsx`, its test
- Modify: `app/select-context/page.tsx`, `components/context/context-selection-page.tsx` (remove the
  deleted `/admin/*` destinations from the list and union type; PR 05 replaces the list)

**Interfaces:**

- Consumes: `PageHeader`.

- [ ] **Step 1: Rewrite the overview test (failing)**

`app/(authenticated)/admin/page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import AdminOverviewPage from './page';

describe('AdminOverviewPage', () => {
  it('renders the Administration Overview heading', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeInTheDocument();
  });

  it('renders no sample or placeholder data', () => {
    renderWithProviders(<AdminOverviewPage />);

    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

Run: `pnpm test:run "app/(authenticated)/admin/page.test.tsx"` → FAIL.

- [ ] **Step 2: Rewrite `app/(authenticated)/admin/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Tenant overview. Its operational sections (pending approvals, readiness, recent activity)
 * arrive in PR 14 once their data slices exist; nothing is shown that isn't live.
 */
export default function AdminOverviewPage() {
  return (
    <PageHeader
      eyebrow={administrationModule.name}
      title="Administration Overview"
      description="Manage your institution's operational setup, users, and controls."
    />
  );
}
```

- [ ] **Step 3: Migrate the profile and platform headings**

In `components/profile/profile-view.tsx`, replace the `<SectionHeading … />` element and its import
with:

```tsx
import { PageHeader } from '@/components/shell/page-header';
// …
<PageHeader
  eyebrow="Account"
  title="Profile"
  description="Your signed-in identity and workspace assignments."
/>;
```

Rewrite `modules/platform-administration/components/platform-page-shell.tsx`:

```tsx
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';

interface Crumb {
  label: string;
  href?: string;
}

interface PlatformPageShellProps {
  title: string;
  description: string;
  breadcrumbs?: readonly Crumb[];
  children: React.ReactNode;
}

export function PlatformPageShell({
  title,
  description,
  breadcrumbs = [],
  children,
}: PlatformPageShellProps) {
  return (
    <Box sx={{ width: '100%' }}>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          {breadcrumbs.map((crumb) =>
            crumb.href ? (
              <Link key={crumb.href} component={NextLink} href={crumb.href} underline="hover">
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} color="text.primary">
                {crumb.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <PageHeader eyebrow="Platform administration" title={title} description={description} />
      {children}
    </Box>
  );
}
```

In `platform-page-shell.test.tsx`, remove the assertion on the "Read-only stage" chip and assert
the eyebrow text "Platform administration" instead.

- [ ] **Step 4: Delete the placeholders and trim destinations**

Delete the files listed. In `app/select-context/page.tsx` keep only `'/profile'`, `'/admin'`,
`'/platform-admin'`, `'/platform-admin/tenants'` in `ALLOWED_DESTINATIONS`, and mirror that in the
`ContextSelectionDestination` union in `components/context/context-selection-page.tsx`.

- [ ] **Step 5: Run the tests and commit**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add -A app components modules
git commit -m "$(cat <<'EOF'
refactor(shell): remove placeholder pages and sample data; adopt the page header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Shell E2E coverage and layer verification

**Files:**

- Modify: `e2e/fake-api/scenarios.mts` (add `long-names`)
- Modify: `e2e/support/auth.ts` (`FakeApiScenario` gains `'long-names'`)
- Create: `e2e/shell.spec.ts`
- Modify: `e2e/context-selection.spec.ts` (header assertion), `e2e/keycloak-smoke.spec.ts`
  (navigation assertions)

- [ ] **Step 1: Add the long-names scenario**

In `e2e/fake-api/scenarios.mts`, add before `BUILDERS`:

```ts
function longNames(): RunState {
  const state = greenfieldTenant();
  const longUser = {
    ...jane,
    displayName:
      'Wanjiru Njeri Kamau-Otieno Achieng Muthoni Wambui Chebet Jepkosgei Nyambura Akinyi Atieno',
    email: 'wanjiru.njeri.kamau-otieno.achieng.muthoni.wambui@greenfield-teachers-sacco.example',
  };
  return {
    ...state,
    users: [longUser],
    organisations: state.organisations.map((organisation) => ({
      ...organisation,
      displayName:
        'Greenfield Teachers and Public Service Employees Savings and Credit Co-operative Society',
    })),
  };
}
```

and register `'long-names': longNames,` in `BUILDERS`. Add `| 'long-names'` to `FakeApiScenario`.

- [ ] **Step 2: Write `e2e/shell.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { authenticate, selectMuiOption } from './support/auth';

async function enterGreenfield(page: Page) {
  await page.goto('/admin');
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', /Head Office/);
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('application shell', () => {
  test('shows the rail, workspace, context, account, and footer', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo);
    await enterGreenfield(page);

    const rail = page.getByRole('navigation', { name: 'Administration' });
    await expect(rail.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const banner = page.getByRole('banner');
    await expect(banner.getByText('Greenfield SACCO')).toBeVisible();
    await expect(banner.getByText('Head Office')).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Backend Jane Manager' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Finaxis');
  });

  test('remembers a collapsed rail across reloads', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo);
    await enterGreenfield(page);

    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  });

  test('uses a temporary drawer on mobile with no horizontal scroll, even with long names', async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticate(context, testInfo, 'long-names');
    await enterGreenfield(page);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Administration' })
        .getByRole('link', { name: 'Overview' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no serious or critical accessibility violations (${colorScheme})`, async ({
      context,
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await authenticate(context, testInfo);
      await enterGreenfield(page);

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Update existing specs for the new header**

In `e2e/context-selection.spec.ts`, replace
`await expect(page.getByText('Greenfield SACCO · Head Office')).toBeVisible();` with:

```ts
await expect(page.getByRole('banner').getByText('Greenfield SACCO')).toBeVisible();
await expect(page.getByRole('banner').getByText('Head Office')).toBeVisible();
```

In `e2e/keycloak-smoke.spec.ts` (manual suite), replace the `Users` link step with
`await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeVisible();` — the Users page
no longer exists until PR 10.

- [ ] **Step 4: Gates, visual check, commit**

```bash
pnpm exec prettier --write e2e
pnpm check
pnpm build
pnpm test:e2e
```

Expected: all pass. Then screenshot `/admin` and `/platform-admin/tenants` in the browser pane at
1440 px and 375 px, light and dark, expanded and collapsed rail; compare against the prototype
screenshots (spec §2 sources) and run the ui-ux-pro-max pre-delivery checklist.

```bash
git add e2e
git commit -m "$(cat <<'EOF'
test(e2e): cover the shell rail, collapse persistence, mobile drawer, and a11y

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
