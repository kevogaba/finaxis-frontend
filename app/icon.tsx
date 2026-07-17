import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Generated from the same bar motif as `FinaxisLogo` — a temporary mark until
 * the official logo asset replaces it.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 3,
        background: '#0F1F3D',
        borderRadius: 8,
        padding: 6,
      }}
    >
      <div style={{ width: 5, height: 12, background: '#F8FAFC', borderRadius: 2 }} />
      <div style={{ width: 5, height: 20, background: '#F8FAFC', borderRadius: 2 }} />
      <div style={{ width: 5, height: 16, background: '#F8FAFC', borderRadius: 2 }} />
    </div>,
    { ...size },
  );
}
