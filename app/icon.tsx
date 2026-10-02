import { ImageResponse } from 'next/og';
import { BRAND, MARK_GRADIENT } from '@/theme/tokens';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon rendered from the same geometry as `FinaxisLogo` on the navy brand tile. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: BRAND.navy,
        borderRadius: 8,
      }}
    >
      <svg width="32" height="32" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="mark" x1="8" y1="36" x2="32" y2="4" gradientUnits="userSpaceOnUse">
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
          fill="url(#mark)"
        />
        <rect
          x="21"
          y="11"
          width="8"
          height="26"
          rx="4"
          transform="rotate(35 25 24)"
          fill="url(#mark)"
        />
      </svg>
    </div>,
    { ...size },
  );
}
