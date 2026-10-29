import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { boundedBody, GatewayError, requireSameOrigin } from '@/lib/gateway-security';

const handler = NextAuth(authOptions);
export { handler as GET };

export async function POST(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (request.nextUrl.pathname === '/api/auth/callback/admin-login') {
    try {
      requireSameOrigin(request);
      const body = await boundedBody(request);
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      request = new NextRequest(request.url, { method: 'POST', headers, body });
    } catch (error) {
      return Response.json({ error: error instanceof GatewayError ? error.message : 'Sign-in unavailable' }, {
        status: error instanceof GatewayError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' },
      });
    }
  }
  return handler(request, context);
}
