import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FinaxisLogo } from './finaxis-logo';

describe('FinaxisLogo', () => {
  it('renders a decorative 40px mark by default', () => {
    const { container } = render(<FinaxisLogo />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('draws the two interlocking strokes with a gradient', () => {
    const { container } = render(<FinaxisLogo size={64} />);

    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelector('linearGradient')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('width', '64');
  });

  it('gives each instance its own gradient id so marks never collide', () => {
    const { container } = render(
      <>
        <FinaxisLogo />
        <FinaxisLogo />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((node) => node.id);

    expect(new Set(ids).size).toBe(2);
    container.querySelectorAll('rect').forEach((rect) => {
      expect(ids.map((id) => `url(#${id})`)).toContain(rect.getAttribute('fill'));
    });
  });
});
