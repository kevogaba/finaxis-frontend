import { useId } from 'react';
import type { SVGProps } from 'react';
import { MARK_GRADIENT } from '@/theme/tokens';

interface FinaxisLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * The Finaxis mark: two interlocking strokes rising left to right — members, institutions, and
 * transactions moving through one governed platform — shading from deep blue to teal. Recreated
 * from the prototype's raster mark (spec §7.4). Decorative: always paired with visible "Finaxis"
 * text. A Server Component: React's Server Components dispatcher implements `useId` (unlike
 * `useState`/`useEffect`, which it throws on — see the `HooksDispatcher` in
 * node_modules/next/dist/compiled/react-server-dom-webpack/cjs/*.js), so repeated marks still get
 * distinct gradient ids without a client boundary.
 */
export function FinaxisLogo({ size = 40, ...props }: FinaxisLogoProps) {
  const gradientId = `finaxis-mark-${useId()}`;

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
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="36"
          x2="32"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={MARK_GRADIENT[0]} />
          <stop offset="0.55" stopColor={MARK_GRADIENT[1]} />
          <stop offset="1" stopColor={MARK_GRADIENT[2]} />
        </linearGradient>
      </defs>
      <rect
        x="11"
        y="3"
        width="8"
        height="26"
        rx="4"
        transform="rotate(35 15 16)"
        fill={`url(#${gradientId})`}
      />
      <rect
        x="21"
        y="11"
        width="8"
        height="26"
        rx="4"
        transform="rotate(35 25 24)"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
