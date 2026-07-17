import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FinaxisLogo } from './finaxis-logo';

describe('FinaxisLogo', () => {
  it('renders as a decorative, accessibility-hidden mark', () => {
    const { container } = render(<FinaxisLogo />);
    const svg = container.querySelector('svg');

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('accepts a custom size', () => {
    const { container } = render(<FinaxisLogo size={64} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });
});
