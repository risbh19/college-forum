import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isCurrentForumToken } from './lib/access-policy';
import { rateLimits } from './lib/rate-limit';
import { GatewayError, requireSameOrigin } from './lib/gateway-security';

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV === 'development';
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${development ? ' ws: wss:' : ''}; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'`;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const secure = (response: Response) => {
    response.headers.set('Content-Security-Policy', policy);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (!development) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  };
  const next = () => secure(NextResponse.next({ request: { headers: requestHeaders } }));
  const { pathname } = req.nextUrl;
  if (pathname === '/privacy') return next();
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    const limited = await rateLimits.auth(req);
    if (limited) return secure(limited);
    return next();
  }

  if (isApi && ['POST', 'DELETE', 'PATCH'].includes(req.method)) {
    try { requireSameOrigin(req); }
    catch (error) {
      return secure(NextResponse.json({ error: error instanceof GatewayError ? error.message : 'Service temporarily unavailable' }, {
        status: error instanceof GatewayError ? error.status : 503,
      }));
    }
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, secureCookie: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') });

  if (!isCurrentForumToken(token)) {
    if (pathname === '/login') return next();
    if (isApi) return secure(NextResponse.json({ error: 'Login required' }, { status: 401 }));
    return secure(NextResponse.redirect(new URL('/login', req.url)));
  }

  if (!token?.username) {
    if (pathname === '/setup-username' || pathname === '/api/username') {
      return next();
    }
    if (isApi) return secure(NextResponse.json({ error: 'Set a username first' }, { status: 403 }));
    return secure(NextResponse.redirect(new URL('/setup-username', req.url)));
  }

  if (pathname === '/login' || pathname === '/setup-username') {
    return secure(NextResponse.redirect(new URL('/', req.url)));
  }
  return next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
