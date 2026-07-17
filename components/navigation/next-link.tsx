'use client';

/**
 * Next.js 16 rejects passing `next/link` directly as a `component` prop from a
 * Server Component into a Client Component (e.g. MUI `Button`/`Link`) — the
 * function reference can't cross that boundary. This client re-export fixes it.
 */
import Link from 'next/link';

export default Link;
export type { LinkProps } from 'next/link';
