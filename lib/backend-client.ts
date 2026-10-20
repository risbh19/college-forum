import { signBackendAssertion } from './backend-assertion';

export class BackendError extends Error {
  constructor(public status: number, message: string, public retryAfter?: string) { super(message); }
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
  const payload: T & { error?: string } = await response.json();
  if (!response.ok) throw new BackendError(response.status, payload.error ?? 'Request failed', response.headers.get('retry-after') ?? undefined);
  return payload;
}

export async function backendUsername(viewerId: string): Promise<string | null> {
  return (await backendRequest<{ username: string | null }>(viewerId, '/internal/session', 'GET', '', 'identity')).username;
}
