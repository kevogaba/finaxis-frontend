import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { renderWithProviders } from '@/test/test-utils';
import { KPI_UNAVAILABLE, KpiTile } from './kpi-tile';

const tile = (props: Partial<Parameters<typeof KpiTile>[0]> = {}) =>
  renderWithProviders(
    <KpiTile
      id="kpi-active"
      label="Active institutions"
      value={1234}
      caption="Leaves out the platform organisation itself"
      icon={<CheckCircleOutlined />}
      tone="success"
      {...props}
    />,
  );

describe('KpiTile', () => {
  it('names its group by the label and formats the value', () => {
    tile();
    const group = screen.getByRole('group', { name: 'Active institutions' });
    expect(within(group).getByText('1,234')).toBeInTheDocument();
    expect(
      within(group).getByText('Leaves out the platform organisation itself'),
    ).toBeInTheDocument();
  });

  it("says the count couldn't be loaded, with its reference, and never shows 0", () => {
    tile({ value: null, reference: 'req-7' });
    const group = screen.getByRole('group', { name: 'Active institutions' });
    expect(within(group).getByText(KPI_UNAVAILABLE)).toBeInTheDocument();
    expect(within(group).getByText('Reference: req-7')).toBeInTheDocument();
    expect(within(group).queryByText('0')).toBeNull();
  });

  it('links with its own name, and hides the icon from assistive technology', () => {
    const { container } = tile({
      link: { href: '/platform-admin/tenants?status=ACTIVE', label: 'View active institutions' },
    });
    expect(screen.getByRole('link', { name: 'View active institutions' })).toHaveAttribute(
      'href',
      '/platform-admin/tenants?status=ACTIVE',
    );
    // The square, not the svg: MUI's SvgIcon marks itself aria-hidden whatever its parent does.
    expect(container.querySelector('svg')?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
