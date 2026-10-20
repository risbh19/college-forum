import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BackendError, backendRequest } from '@/lib/backend-client';
import { boundedBody, GatewayError, requireSameOrigin } from '@/lib/gateway-security';

export const dynamic = 'force-dynamic';

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return Response.json({ error: 'Login required' }, { status: 401 });
    const path = `/api/${(await params).path.join('/')}`;
    if (!/^\/api\/(username|posts(?:\/[A-Za-z0-9_-]{1,40})?|comments|votes)$/.test(path)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (!session.user.username && path !== '/api/username') return Response.json({ error: 'Choose a username first' }, { status: 403 });
    let body = '';
    if (request.method !== 'GET') {
      requireSameOrigin(request);
      if (request.method === 'POST' && request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
        return Response.json({ error: 'Use application/json' }, { status: 415 });
      }
      body = await boundedBody(request);
    }
    const search = new URL(request.url).search;
    if (search.length > 2048) return Response.json({ error: 'Query is too long' }, { status: 414 });
    const payload = await backendRequest(session.user.id, path + search, request.method, body);
    return Response.json(payload, { status: request.method === 'POST' && ['/api/posts', '/api/comments'].includes(path) ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof GatewayError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof BackendError) return Response.json({ error: error.message }, { status: error.status, headers: error.retryAfter ? { 'Retry-After': error.retryAfter } : {} });
    return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE };
