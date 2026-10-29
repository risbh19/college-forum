import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { adminLoginPolicy, isCurrentForumToken, COLLEGE_AUTH_POLICY } from '../lib/access-policy';
import { authorizeAdmin } from '../lib/admin-login';
import { authOptions } from '../lib/auth';
import type { JWT } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/auth/[...nextauth]/route';
import { spawnSync } from 'node:child_process';

const ident = 'e'.repeat(32);
const version = 'f'.repeat(32);
const configuration = {
  NODE_ENV: 'production', ADMIN_LOGIN_ENABLED: '1', ADMIN_LOGIN_ACCOUNT_ID: ident,
  ADMIN_LOGIN_VERSION: version, NEXTAUTH_URL: 'https://forum.example', BACKEND_URL: 'https://backend.example',
  BACKEND_SHARED_SECRET: 'synthetic-backend-admin-test-key-123456789',
} as const;

function configure(context: TestContext) {
  const env: Record<string, string | undefined> = process.env;
  const previous = Object.fromEntries(Object.keys(configuration).map(key => [key, env[key]]));
  Object.assign(env, configuration);
  context.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete env[key]; else env[key] = value; } });
}

test('operator credentials stay disabled outside complete HTTPS production configuration', context => {
  configure(context);
  assert.ok(adminLoginPolicy());
  const env: Record<string, string | undefined> = process.env;
  for (const [key, value] of Object.entries({ NODE_ENV: 'development', ADMIN_LOGIN_ENABLED: '0', ADMIN_LOGIN_ACCOUNT_ID: 'bad', ADMIN_LOGIN_VERSION: '', NEXTAUTH_URL: 'http://forum.example', BACKEND_URL: 'http://localhost:8000' })) {
    const previous = env[key]; env[key] = value;
    assert.equal(adminLoginPolicy(), null);
    env[key] = previous;
  }
});

test('production registers the dedicated credentials provider without enabling local accounts', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "import('./lib/auth.ts').then(m => process.stdout.write((m.authOptions ?? m.default.authOptions).providers.map(p => p.options?.id ?? p.id).join(',')))"], {
    env: { ...process.env, ...configuration }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'admin-login,google');
});

test('operator session version can be revoked without changing student sessions', context => {
  configure(context);
  const token = { anonId: ident, authPolicy: adminLoginPolicy() };
  assert.equal(isCurrentForumToken(token), true);
  assert.equal(isCurrentForumToken({ ...token, anonId: 'a'.repeat(32) }), false);
  process.env.ADMIN_LOGIN_VERSION = 'b'.repeat(32);
  assert.equal(isCurrentForumToken(token), false);
  assert.equal(isCurrentForumToken({ anonId: 'a'.repeat(32), authPolicy: COLLEGE_AUTH_POLICY }), true);
  process.env.ADMIN_LOGIN_ENABLED = '0';
  assert.equal(isCurrentForumToken({ anonId: ident, authPolicy: `admin-password-v1:${'b'.repeat(32)}` }), false);
});

test('credential verification sends only bounded input over a signed private request and fails closed', async context => {
  configure(context);
  const fetch = context.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(options?.body)), { username: 'forum_admin', password: 'synthetic-password' });
    const headers = options?.headers as Record<string, string>;
    const claims = JSON.parse(Buffer.from(headers.Authorization.split('.')[1], 'base64url').toString());
    assert.equal(claims.scope, 'admin-login');
    assert.equal(claims.sub, ident);
    assert.equal(claims.path, '/internal/admin-login');
    return Response.json({ username: 'forum_admin' });
  });
  assert.deepEqual(await authorizeAdmin({ username: 'forum_admin', password: 'synthetic-password' }), { id: ident });
  assert.equal(await authorizeAdmin({ username: 'forum_admin', password: 'x', userId: ident }), null);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => Response.json({ error: 'private-sensitive-diagnostics' }, { status: 429 }));
  assert.equal(await authorizeAdmin({ username: 'forum_admin', password: 'wrong' }), null);
});

test('admin callbacks rebuild minimal tokens and ignore client privilege and identity changes', async context => {
  configure(context);
  context.mock.method(globalThis, 'fetch', async () => Response.json({ username: 'forum_admin' }));
  const jwt = authOptions.callbacks!.jwt!;
  const policy = adminLoginPolicy()!;
  const token = await jwt({ token: { email: 'synthetic-private@example.invalid' }, user: { id: ident }, account: { provider: 'admin-login', type: 'credentials', providerAccountId: ident }, trigger: 'signIn' });
  assert.deepEqual(token, { anonId: ident, username: 'forum_admin', authPolicy: policy });
  const updated = await jwt({ token: token as JWT, trigger: 'update', session: { anonId: 'a'.repeat(32), username: 'spoof', isAdmin: true }, user: { id: ident }, account: null });
  assert.deepEqual(updated, token);
  const session = await authOptions.callbacks!.session!({ session: { expires: '2030-01-01', user: { id: '', username: null } }, token: token as JWT, user: { id: ident, email: '', emailVerified: null }, trigger: 'update', newSession: {} });
  assert.deepEqual(session, { expires: '2030-01-01', user: { id: ident, username: 'forum_admin' } });
});

test('admin callback rejects cross-site and oversized bodies before NextAuth parses credentials', async context => {
  configure(context);
  const url = 'https://forum.example/api/auth/callback/admin-login';
  const route = { params: Promise.resolve({ nextauth: ['callback', 'admin-login'] }) };
  const crossSite = await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' }), route);
  assert.equal(crossSite.status, 403);
  const large = await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://forum.example' }, body: 'x'.repeat(20481) }), route);
  assert.equal(large.status, 413);
});
