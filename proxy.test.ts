import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

function requestFor(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3100'), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('proxy', () => {
  it('redirects protected routes without a session cookie', () => {
    const response = proxy(requestFor('/admin'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/login?reason=session_expired',
    );
  });

  it('lets login render even when an unvalidated session cookie is present', () => {
    const response = proxy(requestFor('/login', 'finaxis.session_token=stale'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not match login requests', () => {
    expect(config.matcher).toEqual(['/admin/:path*', '/profile']);
  });
});
