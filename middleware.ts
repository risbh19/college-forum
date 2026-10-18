import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.anonId) {
    if (pathname === '/login') return NextResponse.next();
    if (isApi) return NextResponse.json({ error: 'Login required' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!token.username) {
    if (pathname === '/setup-username' || pathname === '/api/username') {
      return NextResponse.next();
    }
    if (isApi) return NextResponse.json({ error: 'Set a username first' }, { status: 403 });
    return NextResponse.redirect(new URL('/setup-username', req.url));
  }

  if (pathname === '/login' || pathname === '/setup-username') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
