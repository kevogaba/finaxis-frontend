import type { SVGProps } from 'react';

interface FinaxisLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Temporary Finaxis mark: ascending bars in a rounded badge, evoking growth and
 * ledger records. Isolated here so it can be swapped for the official logo asset
 * without touching call sites. Decorative — always paired with visible "Finaxis" text.
 */
export function FinaxisLogo({ size = 40, ...props }: FinaxisLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect width="40" height="40" rx="10" fill="currentColor" fillOpacity="0.14" />
      <path
        d="M12 27V19M20 27V11M28 27V21"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
