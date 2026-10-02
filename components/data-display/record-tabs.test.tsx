import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { tabsClasses } from '@mui/material/Tabs';
import { renderWithProviders } from '@/test/test-utils';
import { RecordTabs } from './record-tabs';

let pathname = '/admin/branches/b1/users';
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => pathname };
});

const TABS = [
  { href: '/admin/branches/b1', label: 'Overview' },
  { href: '/admin/branches/b1/users', label: 'Users' },
  { href: '/admin/branches/b1/audit', label: 'Audit' },
];

describe('RecordTabs', () => {
  it('renders deep-linkable tabs inside a named navigation landmark', () => {
    pathname = '/admin/branches/b1/users';
    renderWithProviders(<RecordTabs label="Westlands Branch sections" tabs={TABS} />);

    expect(
      screen.getByRole('navigation', { name: 'Westlands Branch sections' }),
    ).toBeInTheDocument();
    const users = screen.getByRole('tab', { name: 'Users' });
    expect(users).toHaveAttribute('href', '/admin/branches/b1/users');
    expect(users).toHaveAttribute('aria-selected', 'true');
    expect(users).toHaveAttribute('aria-current', 'page');
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent tab on a sub-route and selects Overview on the record root', () => {
    pathname = '/admin/branches/b1/users/u9';
    const { unmount } = renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    pathname = '/admin/branches/b1';
    renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects no tab on an unlisted or hidden sub-route below the record root', () => {
    pathname = '/admin/branches/b1/audit';
    renderWithProviders(
      <RecordTabs
        label="Sections"
        tabs={[
          { href: '/admin/branches/b1', label: 'Overview' },
          { href: '/admin/branches/b1/users', label: 'Users' },
        ]}
      />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-selected', 'false');
    }
  });

  it("nudges the selected tab back into view once the scroller's own size settles", () => {
    // Regression for the scroll-buttons-arrive-late bug (index item 1, 375px full page load): MUI
    // scrolls the selected tab into view before `scrollButtons="auto"` decides to add its two 40px
    // buttons, which can then push an already-visible tab back out. jsdom has neither
    // `ResizeObserver` nor `scrollIntoView`, so both are stubbed to observe the wiring. Tabs itself
    // also observes each tab child with its own ResizeObserver once one exists, so the fake tracks
    // every instance and picks out ours by what it observes, rather than assuming there's only one.
    pathname = '/admin/branches/b1/audit';
    const instances: { callback: () => void; observe: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: () => void;
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        constructor(callback: () => void) {
          this.callback = callback;
          instances.push(this);
        }
      },
    );
    // jsdom has no scrollIntoView implementation at all (unlike the DOM lib types, which declare it
    // unconditionally), so it needs a stub before it can be spied on below.
    Element.prototype.scrollIntoView = () => undefined;

    renderWithProviders(<RecordTabs label="Sections" tabs={TABS} />);

    const ours = instances.find((instance) => {
      const target = instance.observe.mock.calls[0]?.[0] as HTMLElement | undefined;
      return target?.classList.contains(tabsClasses.scroller) === true;
    });
    expect(ours).toBeDefined();

    // The selected tab overflows the scroller's right edge by 30px: only the scroller moves, by
    // exactly that much — never scrollIntoView, which can also scroll the page vertically.
    const audit = screen.getByRole('tab', { name: 'Audit' });
    const scroller = document.querySelector<HTMLElement>(`.${tabsClasses.scroller}`);
    if (!scroller) throw new Error('No tab scroller rendered');
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 0, 295, 48));
    vi.spyOn(audit, 'getBoundingClientRect').mockReturnValue(new DOMRect(285, 0, 80, 48));
    scroller.scrollLeft = 100;
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    ours?.callback();

    expect(scroller.scrollLeft).toBe(130);
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });
});
