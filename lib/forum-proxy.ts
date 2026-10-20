import type { Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { BackendError, backendRequest, publicBackendError } from './backend-client';
import { boundedBody, GatewayError, requireSameOrigin } from './gateway-security';
import { readJson } from './api';
import { rateLimits } from './rate-limit';

type Dependencies = {
  session: () => Promise<Session | null>;
  limit: typeof rateLimits.account;
  backend: (viewerId: string, path: string, method: string, body: string) => Promise<unknown>;
};

function allowedMethods(path: string): string[] {
  if (path === '/api/posts' || path === '/api/comments') return ['GET', 'POST'];
  if (['/api/username', '/api/votes', '/api/reports'].includes(path)) return ['POST'];
  if (/^\/api\/posts\/[A-Za-z0-9_-]{1,40}$/.test(path)) return ['GET', 'DELETE'];
  if (['/api/admin/reports', '/api/admin/status'].includes(path)) return ['GET'];
  if (/^\/api\/admin\/(posts|comments)\/[A-Za-z0-9_-]{1,40}$/.test(path)) return ['PATCH', 'DELETE'];
  return [];
}

export function createForumProxy(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    session: () => getServerSession(authOptions), limit: rateLimits.account, backend: backendRequest, ...overrides,
  };
  return async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    try {
      const session = await deps.session();
      if (!session?.user.id) return Response.json({ error: 'Login required' }, { status: 401 });
      const path = `/api/${(await params).path.join('/')}`;
      const methods = allowedMethods(path);
      if (!methods.length) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (!methods.includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: methods.join(', ') } });
      if (!session.user.username && path !== '/api/username') return Response.json({ error: 'Choose a username first' }, { status: 403 });
      let body = '';
      if (request.method !== 'GET') {
        requireSameOrigin(request);
        if (['POST', 'PATCH'].includes(request.method) && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          return Response.json({ error: 'Use application/json' }, { status: 415 });
        }
        const limited = await deps.limit(request.method, path, session.user.id);
        if (limited) return limited;
        body = ['POST', 'PATCH'].includes(request.method) ? JSON.stringify(await readJson(request)) : await boundedBody(request);
      }
      const search = new URL(request.url).search;
      if (search.length > 2048) return Response.json({ error: 'Query is too long' }, { status: 414 });
      const payload = await deps.backend(session.user.id, path + search, request.method, body);
      return Response.json(payload, { status: request.method === 'POST' && ['/api/posts', '/api/comments'].includes(path) ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof GatewayError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof BackendError) return Response.json({ error: publicBackendError(error.status, error.message) }, { status: error.status, headers: error.status === 429 && error.retryAfter && /^\d{1,6}$/.test(error.retryAfter) ? { 'Retry-After': error.retryAfter } : {} });
      return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }
  };
}
