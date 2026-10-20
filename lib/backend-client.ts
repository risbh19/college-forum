import { signBackendAssertion } from './backend-assertion';

export class BackendError extends Error {
  constructor(public status: number, message: string, public retryAfter?: string) { super(message); }
}

const publicErrors = new Set([
  'Choose a username first', 'Username already set', 'Username already taken or already set',
  'Post not found', 'Comment not found', 'Content not found', 'Not your post', 'Admin access required',
  'You cannot report your own content', 'Too many requests. Try again shortly.',
  'This page link has expired. Refresh the feed and try again.',
]);

export function publicBackendError(status: number, message: string): string {
  if (status >= 500) return 'Service temporarily unavailable';
  if (publicErrors.has(message)) return message;
  return ({ 400: 'Invalid input', 401: 'Login required', 403: 'Access denied', 404: 'Not found',
    405: 'Method not allowed', 409: 'Request conflicts with existing data', 413: 'Request body is too large',
    415: 'Use application/json', 429: 'Too many requests. Try again shortly.' } as Record<number, string>)[status] ?? 'Request failed';
}

export async function backendRequest<T>(viewerId: string, path: string, method = 'GET', body = '', scope = 'forum'): Promise<T> {
  const base = new URL(process.env.BACKEND_URL ?? 'http://127.0.0.1:8000');
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new BackendError(503, 'Backend configuration is invalid');
  }
  if (!path.startsWith('/api/') && path !== '/internal/session') throw new BackendError(400, 'Invalid backend path');
  const destination = new URL(path, base);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${signBackendAssertion(viewerId, method, destination.pathname, body, scope)}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(destination, { method, headers, body: body || undefined, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch { throw new BackendError(503, 'Backend temporarily unavailable'); }
  let payload: T & { error?: string };
  try { payload = await response.json(); }
  catch { throw new BackendError(503, 'Service temporarily unavailable'); }
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    throw new BackendError(response.status, publicBackendError(response.status, typeof payload?.error === 'string' ? payload.error : ''),
      response.status === 429 && retry && /^\d{1,6}$/.test(retry) ? retry : undefined);
  }
  return payload;
}

export async function backendUsername(viewerId: string): Promise<string | null> {
  return (await backendRequest<{ username: string | null }>(viewerId, '/internal/session', 'GET', '', 'identity')).username;
}
