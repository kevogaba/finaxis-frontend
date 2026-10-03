import { describe, expect, it, vi } from 'vitest';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import { screen } from '@testing-library/react';
import { ownStyle } from '@/test/own-style';
import { renderWithProviders } from '@/test/test-utils';
import { DescriptionList } from './data-display/description-list';
import { EmptyState } from './data-display/empty-state';
import { ForbiddenState } from './data-display/forbidden-state';
import { ListToolbar } from './data-display/list-toolbar';
import { RecordHero } from './data-display/record-hero';
import { SectionCard } from './data-display/section-card';
import { TruncatedText } from './data-display/truncated-text';
import { PageHeader } from './shell/page-header';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/admin/audit',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

/**
 * MUI v9 silently drops a dotted palette path in Typography's `color` prop: `color="text.secondary"`
 * emits no colour rule, so the text inherits its parent's (primary text, in practice), while
 * `sx={{ color: 'text.secondary' }}` and `color="textSecondary"` work. These read each element's
 * own emotion class, since a computed style would also report an inherited colour.
 */
const MUTED = '--finaxis-palette-text-secondary';
const STRONG = '--finaxis-palette-text-primary';

describe('shared text colours (MUI v9 drops dotted palette paths on Typography)', () => {
  it('mutes the page header eyebrow and description', () => {
    renderWithProviders(
      <PageHeader eyebrow="Administration" title="Branches" description="Manage branches." />,
    );

    expect(ownStyle(screen.getByText('Administration'), 'color')).toContain(MUTED);
    expect(ownStyle(screen.getByText('Manage branches.'), 'color')).toContain(MUTED);
  });

  it("mutes the record hero's overline and subtitle", () => {
    renderWithProviders(
      <RecordHero
        avatar={{ kind: 'icon', icon: <AccountTreeOutlined /> }}
        eyebrow="Administration · Branch record"
        title="Westlands Branch"
        subtitle="WESTLANDS · Operations"
      />,
    );

    expect(ownStyle(screen.getByText('Administration · Branch record'), 'color')).toContain(MUTED);
    expect(ownStyle(screen.getByText('WESTLANDS · Operations'), 'color')).toContain(MUTED);
  });

  it("mutes a section card's description and every description-list term", () => {
    renderWithProviders(
      <SectionCard title="Details" description="Identity details">
        <DescriptionList items={[{ label: 'Branch code', value: 'WST-002' }]} />
      </SectionCard>,
    );

    expect(ownStyle(screen.getByText('Identity details'), 'color')).toContain(MUTED);
    expect(ownStyle(screen.getByRole('term'), 'color')).toContain(MUTED);
  });

  it("mutes a list toolbar's result count", () => {
    renderWithProviders(<ListToolbar fields={[]} resultLabel="7 institutions" timeZone="UTC" />);

    expect(ownStyle(screen.getByText('7 institutions'), 'color')).toContain(MUTED);
  });

  it('shows the empty and forbidden titles in the primary text colour', () => {
    renderWithProviders(
      <>
        <EmptyState title="No institutions" />
        <ForbiddenState title="Only a draft can be amended" />
      </>,
    );

    expect(ownStyle(screen.getByText('No institutions'), 'color')).toContain(STRONG);
    expect(ownStyle(screen.getByText('Only a draft can be amended'), 'color')).toContain(STRONG);
  });

  it('lets a caller mute truncated text with color="textSecondary"', () => {
    renderWithProviders(
      <TruncatedText value="amina@tujenge.example" maxWidth={280} color="textSecondary" />,
    );

    expect(ownStyle(screen.getByText('amina@tujenge.example'), 'color')).toContain(MUTED);
  });
});
