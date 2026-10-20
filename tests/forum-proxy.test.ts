import assert from 'node:assert/strict';
import test from 'node:test';
import { createForumProxy } from '../lib/forum-proxy';
import { BackendError } from '../lib/backend-client';

const ORIGIN = 'https://forum.example';
const session = { expires: '2030-01-01T00:00:00Z', user: { id: 'a'.repeat(32), username: 'test_alias' } };
const params = (endpoint: string) => ({ params: Promise.resolve({ path: [endpoint] }) });
function request(endpoint: string) {
  return new Request(`${ORIGIN}/api/${endpoint}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
}

test('all proxy methods fail closed on auth, membership, path, CSRF, content type and body validation', async (context) => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = ORIGIN;
  context.after(() => { if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous; });
  const backend = context.mock.fn(async () => ({ success: true }));
  const limit = async () => null;
  const proxy = createForumProxy({ session: async () => session, limit, backend });
  const noUsername = createForumProxy({ session: async () => ({ ...session, user: { ...session.user, username: null } }), limit, backend });
  assert.equal((await noUsername(request('reports'), params('reports'))).status, 403);
  for (const method of ['POST', 'DELETE', 'PATCH']) {
    const endpoint = method === 'POST' ? 'reports' : 'admin/posts/test';
    const route = { params: Promise.resolve({ path: endpoint.split('/') }) };
    assert.equal((await createForumProxy({ session: async () => null, backend })(new Request(`${ORIGIN}/api/${endpoint}`, { method }), route)).status, 401);
    assert.equal((await proxy(new Request(`${ORIGIN}/api/${endpoint}`, { method }), route)).status, 403);
  }
  assert.equal((await proxy(request('internal/session'), { params: Promise.resolve({ path: ['internal', 'session'] }) })).status, 404);
  assert.equal((await proxy(new Request(`${ORIGIN}/api/votes`), params('votes'))).status, 405);
  for (const [body, contentType, status] of [['{}', 'text/plain', 415], ['{', 'application/json', 400], ['x'.repeat(20481), 'application/json', 413]] as const) {
    const response = await proxy(new Request(`${ORIGIN}/api/reports`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': contentType }, body }), params('reports'));
    assert.equal(response.status, status);
  }
  assert.equal(backend.mock.callCount(), 0);
});

test('backend and unexpected errors cannot leak SQL details, private identifiers or tokens through the gateway', async () => {
  for (const error of [new BackendError(500, 'SQL error: userId=synthetic-id token=synthetic-token'), new BackendError(400, 'private-validation-details'), new Error('internal stack payload')]) {
    const proxy = createForumProxy({ session: async () => session, backend: async () => { throw error; } });
    const response = await proxy(new Request(`${ORIGIN}/api/posts`), params('posts'));
    assert.deepEqual(await response.json(), { error: error instanceof BackendError && error.status === 400 ? 'Invalid input' : 'Service temporarily unavailable' });
  }
});

test('the gateway returns quota 429/Retry-After before any FastAPI request', async (context) => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = ORIGIN;
  context.after(() => { if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous; });
  for (const endpoint of ['posts', 'comments', 'votes', 'username']) {
    const backend = context.mock.fn(async () => ({}));
    const limit = context.mock.fn(async () => Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': '3600' } }));
    const proxy = createForumProxy({ session: async () => session, limit, backend });
    const response = await proxy(request(endpoint), params(endpoint));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3600');
    assert.deepEqual(await response.json(), { error: 'Too many requests. Try again shortly.' });
    assert.equal(backend.mock.callCount(), 0);
    assert.deepEqual(limit.mock.calls[0].arguments, ['POST', `/api/${endpoint}`, session.user.id]);
  }
});

test('the gateway checks authentication/CSRF first and forwards allowed requests once', async (context) => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = ORIGIN;
  context.after(() => { if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous; });
  const limit = context.mock.fn(async () => null);
  const backend = context.mock.fn(async () => ({ id: 'synthetic-post' }));
  const denied = createForumProxy({ session: async () => null, limit, backend });
  assert.equal((await denied(request('posts'), params('posts'))).status, 401);
  const proxy = createForumProxy({ session: async () => session, limit, backend });
  const crossSite = new Request(`${ORIGIN}/api/posts`, { method: 'POST', headers: { origin: 'https://attacker.invalid' } });
  assert.equal((await proxy(crossSite, params('posts'))).status, 403);
  assert.equal(limit.mock.callCount(), 0);
  const allowed = await proxy(request('posts'), params('posts'));
  assert.equal(allowed.status, 201);
  assert.equal(limit.mock.callCount(), 1);
  assert.equal(backend.mock.callCount(), 1);
});
