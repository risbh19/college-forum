import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { createRateLimitGuard } from '../lib/rate-limit';

const ONE = 'a'.repeat(32), TWO = 'b'.repeat(32);
const SECRET = 'synthetic-private-rate-limit-key-at-least-32';
const TOKEN = 'synthetic-upstash-token-never-for-production';
const ENV = { NEXTAUTH_SECRET: SECRET, UPSTASH_REDIS_REST_URL: 'https://synthetic.upstash.io', UPSTASH_REDIS_REST_TOKEN: TOKEN, VERCEL: '1' };
const FAILURE_CODES = ['CONFIG_INVALID', 'VERCEL_ENV_MISSING', 'CLIENT_IP_HEADER_ABSENT', 'CLIENT_IP_INVALID', 'REDIS_TIMEOUT', 'REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_OTHER'] as const;
const PRIVATE_DIAGNOSTIC = `${SECRET} ${TOKEN} ${ENV.UPSTASH_REDIS_REST_URL} 192.0.2.1 2001:db8::1 ${ONE} ${TWO}`;

function captureLogs(context: TestContext) {
  const log = context.mock.method(console, 'log', () => {});
  const warn = context.mock.method(console, 'warn', () => {});
  const error = context.mock.method(console, 'error', () => {});
  return (expected: readonly string[]) => {
    assert.deepEqual(error.mock.calls.map(call => call.arguments), expected.map(code => [code]));
    assert.equal(log.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 0);
    for (const call of error.mock.calls) {
      assert.equal(call.arguments.length, 1);
      assert.ok(FAILURE_CODES.some(code => code === call.arguments[0]));
    }
    const output = JSON.stringify(error.mock.calls.map(call => call.arguments));
    for (const privateValue of PRIVATE_DIAGNOSTIC.split(' ')) assert.ok(!output.includes(privateValue));
  };
}

async function assertUnavailable(response: Response | null) {
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('retry-after'), '5');
  assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response!.json(), { error: 'Rate limiting temporarily unavailable. Try again shortly.' });
}

/** Exercise the actual Redis/Ratelimit clients against synthetic REST decisions; no live account. */
function fixture(context: TestContext) {
  let clock = 1_800_000_000_000;
  let offline = false;
  const seen: { key: string; limit: number; window: number; headers: Headers }[] = [];
  const counts = new Map<string, number>();
  context.mock.method(Date, 'now', () => clock);
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    if (offline) throw new Error(`Synthetic private failure ${TOKEN} 192.0.2.1`);
    const command: (string | number)[] = JSON.parse(String(init?.body));
    assert.equal(String(command[0]).toLowerCase(), 'evalsha');
    const numberOfKeys = Number(command[2]);
    assert.equal(numberOfKeys, 2);
    const key = String(command[3]);
    const limit = Number(command[3 + numberOfKeys]);
    const window = Number(command[5 + numberOfKeys]);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    seen.push({ key, limit, window, headers: new Headers(init?.headers) });
    return Response.json({ result: [limit - count, limit] });
  });
  const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false });
  return { guard, seen, advance: (milliseconds: number) => { clock += milliseconds; }, offline: () => { offline = true; } };
}

for (const [path, allowed, window] of [
  ['/api/posts', 5, 3_600_000], ['/api/comments', 20, 3_600_000],
  ['/api/votes', 60, 60_000], ['/api/username', 5, 3_600_000],
] as const) {
  test(`${path} enforces the requested account quota and resets`, async (context) => {
    const { guard, seen, advance } = fixture(context);
    const assertLogs = captureLogs(context);
    for (let index = 0; index < allowed; index++) assert.equal(await guard.account('POST', path, ONE), null);
    const blocked = await guard.account('POST', path, ONE);
    assert.equal(blocked?.status, 429);
    assert.deepEqual(await blocked!.json(), { error: 'Too many requests. Try again shortly.' });
    assert.equal(Number(blocked!.headers.get('retry-after')), window / 1000);
    assert.ok(seen.every(call => call.limit === allowed && call.window === window));
    assert.equal(await guard.account('POST', path, TWO), null);
    advance(window + 1);
    assert.equal(await guard.account('POST', path, ONE), null);
    assertLogs([]);
  });
}

test('account buckets are independent and only count the requested POST endpoints', async (context) => {
  const { guard, seen } = fixture(context);
  for (let index = 0; index < 6; index++) await guard.account('POST', '/api/posts', ONE);
  assert.equal(await guard.account('POST', '/api/comments', ONE), null);
  assert.equal(await guard.account('POST', '/api/username', ONE), null);
  const before = seen.length;
  for (const [method, path] of [['GET', '/api/posts'], ['DELETE', '/api/posts/one'], ['POST', '/api/posts/one'], ['POST', '/api/unknown']]) {
    assert.equal(await guard.account(method, path, ONE), null);
  }
  assert.equal(seen.length, before);
});

function authRequest(path: string, ip = '192.0.2.1', method = 'GET') {
  return new Request(`https://forum.example${path}`, { method, headers: { 'x-vercel-forwarded-for': ip } });
}

test('sign-in, callback and signout share 60/min per IP; routine auth calls do not spend quota', async (context) => {
  const { guard, seen, advance } = fixture(context);
  const assertLogs = captureLogs(context);
  for (let index = 0; index < 60; index++) {
    assert.equal(await guard.auth(authRequest(['/api/auth/signin/google', '/api/auth/callback/google', '/api/auth/signout'][index % 3], '192.0.2.1', index % 2 ? 'POST' : 'GET')), null);
  }
  assert.equal(seen.length, 60);
  for (const [method, path] of [['GET', '/api/auth/session'], ['GET', '/api/auth/providers'], ['GET', '/api/auth/csrf'], ['POST', '/api/auth/_log']]) {
    assert.equal(await guard.auth(authRequest(path, '192.0.2.1', method)), null);
  }
  assert.equal(seen.length, 60);
  const blocked = await guard.auth(authRequest('/api/auth/signin/google'));
  assert.equal(blocked?.status, 429);
  assert.equal(blocked?.headers.get('retry-after'), '60');
  assert.equal(blocked?.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await blocked!.json(), { error: 'Too many requests. Try again shortly.' });
  assert.equal(await guard.auth(authRequest('/api/auth/signin/google', '192.0.2.2')), null);
  const sameIp = new Request('https://forum.example/api/auth/callback/google', { headers: { 'x-forwarded-for': '192.0.2.1:42000, 198.51.100.2' } });
  assert.equal((await guard.auth(sameIp))?.status, 429);
  assert.ok(seen.every(call => call.limit === 60 && call.window === 60_000));
  advance(60_001);
  assert.equal(await guard.auth(authRequest('/api/auth/signin/google')), null);
  assertLogs([]);
});

test('all Vercel client IP headers normalize first entries, IPv4 ports and equivalent IP spellings', async (context) => {
  const { guard, seen } = fixture(context);
  const assertLogs = captureLogs(context);
  for (const header of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    for (const ip of ['192.0.2.1', '192.0.2.1:443', '192.0.2.1:54321, 198.51.100.2', ' 192.0.2.1 , 198.51.100.2 ', '::ffff:192.0.2.1']) {
      assert.equal(await guard.auth(new Request('https://forum.example/api/auth/signin/google', { headers: { [header]: ip } })), null);
    }
  }
  assert.equal(new Set(seen.map(call => call.key)).size, 1);
  const ipv4Key = seen[0].key;
  const before = seen.length;
  for (const header of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    for (const ip of ['2001:0db8:0:0:0:0:0:1', '2001:db8::1', '2001:db8::1, 198.51.100.2']) {
      assert.equal(await guard.auth(new Request('https://forum.example/api/auth/signin/google', { headers: { [header]: ip } })), null);
    }
  }
  assert.equal(new Set(seen.slice(before).map(call => call.key)).size, 1);
  assert.notEqual(seen[before].key, ipv4Key);
  assertLogs([]);
});

test('Vercel header precedence skips absent or blank values but never falls back past an invalid first entry', async context => {
  const { guard, seen } = fixture(context);
  const assertLogs = captureLogs(context);
  await guard.auth(authRequest('/api/auth/signin/google'));
  const ipv4Key = seen[0].key;
  for (const headers of [
    { 'x-vercel-forwarded-for': '192.0.2.1, 198.51.100.1', 'x-real-ip': '192.0.2.2', 'x-forwarded-for': '192.0.2.3' },
    { 'x-vercel-forwarded-for': '', 'x-real-ip': '192.0.2.1:443, 198.51.100.1', 'x-forwarded-for': '192.0.2.3' },
    { 'x-vercel-forwarded-for': ' ', 'x-real-ip': '', 'x-forwarded-for': '192.0.2.1, 198.51.100.1' },
  ]) {
    assert.equal(await guard.auth(new Request('https://forum.example/api/auth/signin/google', { headers })), null);
    assert.equal(seen.at(-1)?.key, ipv4Key);
  }
  const before = seen.length;
  const invalidHeaders: Record<string, string>[] = [
    { 'x-vercel-forwarded-for': 'unknown', 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.2' },
    { 'x-real-ip': 'unknown', 'x-forwarded-for': '192.0.2.1' },
    { 'x-forwarded-for': ', 192.0.2.1' },
    { 'x-forwarded-for': 'unknown, 192.0.2.1' },
  ];
  for (const headers of invalidHeaders) {
    await assertUnavailable(await guard.auth(new Request('https://forum.example/api/auth/signin/google', { headers })));
  }
  assert.equal(seen.length, before);
  assertLogs(Array(4).fill('CLIENT_IP_INVALID'));
});

test('forwarding headers are never read or trusted outside Vercel', async context => {
  const assertLogs = captureLogs(context);
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error(PRIVATE_DIAGNOSTIC); });
  const request = new Request('https://forum.example/api/auth/signin/google', {
    headers: { 'x-vercel-forwarded-for': '192.0.2.1', 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.1', vercel: '1' },
  });
  const getHeader = context.mock.method(request.headers, 'get', () => { throw new Error(PRIVATE_DIAGNOSTIC); });
  for (const vercel of [undefined, '', '0', 'true']) {
    const guard = createRateLimitGuard({ environment: () => ({ ...ENV, VERCEL: vercel }), localDemo: () => false });
    await assertUnavailable(await guard.auth(request));
  }
  assert.equal(getHeader.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
  assertLogs(Array(4).fill('VERCEL_ENV_MISSING'));
});

test('routine auth and non-action paths bypass limiter configuration, IP checks and Redis', async context => {
  const assertLogs = captureLogs(context);
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error(PRIVATE_DIAGNOSTIC); });
  const environment = context.mock.fn(() => { throw new Error(PRIVATE_DIAGNOSTIC); });
  const guard = createRateLimitGuard({ environment, localDemo: () => false });
  for (const [method, path] of [
    ['GET', '/api/auth/session'], ['GET', '/api/auth/providers'], ['GET', '/api/auth/csrf'], ['POST', '/api/auth/_log'],
    ['POST', '/api/auth/session'], ['GET', '/api/auth/error'], ['GET', '/api/auth'],
    ['POST', '/api/auth/signin-extra'], ['POST', '/api/authentication/signin'],
  ]) {
    const request = authRequest(path, '192.0.2.1', method);
    const getHeader = context.mock.method(request.headers, 'get', () => { throw new Error(PRIVATE_DIAGNOSTIC); });
    assert.equal(await guard.auth(request), null);
    assert.equal(getHeader.mock.callCount(), 0);
  }
  assert.equal(environment.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
  assertLogs([]);
});

test('encoded sign-in, callback and signout action names cannot bypass their shared quota', async context => {
  const { guard, seen } = fixture(context);
  const assertLogs = captureLogs(context);
  for (const path of ['/api/auth/signin', '/api/auth/%73ignin/google', '/api/auth/%63allback/google', '/api/auth/%73ignout']) {
    assert.equal(await guard.auth(authRequest(path)), null);
  }
  assert.equal(seen.length, 4);
  assert.equal(new Set(seen.map(call => call.key)).size, 1);
  assertLogs([]);
});

test('only namespaced HMAC keys reach Redis; SDK analytics and telemetry stay disabled', async (context) => {
  const { guard, seen } = fixture(context);
  await guard.account('POST', '/api/posts', ONE);
  await guard.auth(authRequest('/api/auth/signin/google'));
  const expected = createHmac('sha256', SECRET).update(`ratelimit:posts:${ONE}`).digest('hex');
  assert.ok(seen[0].key.includes(expected));
  assert.ok(!seen[0].key.includes(ONE));
  assert.ok(!seen[1].key.includes('192.0.2.1'));
  for (const call of seen) {
    assert.match(call.key, /^college-forum:ratelimit:v1:(posts|auth):[a-f0-9]{64}:\d+$/);
    assert.ok(![...call.headers.keys()].some(key => key.startsWith('upstash-telemetry')));
  }
});

test('missing Redis configuration and remote failures return generic 503 without logging private values', async (context) => {
  const { guard, offline } = fixture(context);
  const assertLogs = captureLogs(context);
  offline();
  const result = await guard.auth(authRequest('/api/auth/signin/google'));
  await assertUnavailable(result);
  assertLogs(['REDIS_OTHER']);
  for (const env of [{}, { ...ENV, UPSTASH_REDIS_REST_TOKEN: '' }, { ...ENV, UPSTASH_REDIS_REST_URL: 'http://unsafe.invalid' }]) {
    const missing = createRateLimitGuard({ environment: () => env, localDemo: () => false });
    await assertUnavailable(await missing.account('POST', '/api/posts', ONE));
  }
  assertLogs(['REDIS_OTHER', 'CONFIG_INVALID', 'CONFIG_INVALID', 'CONFIG_INVALID']);
});

test('configuration, Vercel and missing or invalid trusted IP checks log only their fixed reason', async context => {
  const assertLogs = captureLogs(context);
  const expected: string[] = [];
  for (const env of [{}, { ...ENV, NEXTAUTH_SECRET: 'short' }, { ...ENV, UPSTASH_REDIS_REST_TOKEN: `${TOKEN}\n` },
    { ...ENV, UPSTASH_REDIS_REST_URL: `https://user:${TOKEN}@synthetic.upstash.io` },
    { ...ENV, UPSTASH_REDIS_REST_URL: PRIVATE_DIAGNOSTIC }]) {
    const guard = createRateLimitGuard({ environment: () => env, localDemo: () => false });
    await assertUnavailable(await guard.account('POST', '/api/posts', ONE));
    expected.push('CONFIG_INVALID');
  }
  for (const vercel of [undefined, '', '0']) {
    const guard = createRateLimitGuard({ environment: () => ({ ...ENV, VERCEL: vercel }), localDemo: () => false });
    await assertUnavailable(await guard.auth(authRequest('/api/auth/signin/google')));
    expected.push('VERCEL_ENV_MISSING');
  }
  const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false });
  const absentHeaders: Record<string, string>[] = [{}, { 'x-client-ip': '192.0.2.1' },
    { 'x-vercel-forwarded-for': '', 'x-real-ip': ' ', 'x-forwarded-for': '' }];
  for (const headers of absentHeaders) {
    await assertUnavailable(await guard.auth(new Request('https://forum.example/api/auth/signin/google', { headers })));
    expected.push('CLIENT_IP_HEADER_ABSENT');
  }
  for (const ip of ['999.0.0.1', '0192.0.2.1', '192.0.2.1:65536', '192.0.2.1:443extra', '192.0.2.1:',
    '192.0.2.1:123456', 'bad-address', '[2001:db8::1]:443', 'fe80::1%eth0', ', 192.0.2.1', `${TOKEN}:2001:db8::1`]) {
    await assertUnavailable(await guard.auth(authRequest('/api/auth/signin/google', ip)));
    expected.push('CLIENT_IP_INVALID');
  }
  await assertUnavailable(await guard.account('POST', '/api/posts', PRIVATE_DIAGNOSTIC));
  expected.push('CONFIG_INVALID');
  const unavailableEnvironment = createRateLimitGuard({ environment: () => { throw new Error(PRIVATE_DIAGNOSTIC); }, localDemo: () => false });
  await assertUnavailable(await unavailableEnvironment.auth(authRequest('/api/auth/signin/google')));
  await assertUnavailable(await unavailableEnvironment.account('POST', '/api/posts', ONE));
  expected.push('CONFIG_INVALID', 'CONFIG_INVALID');
  assertLogs(expected);
});

test('real Redis SDK auth and write failures log no upstream body, command or private identity', async context => {
  const assertLogs = captureLogs(context);
  let failure = { status: 401, message: 'Unauthorized' };
  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: `${failure.message}: ${PRIVATE_DIAGNOSTIC}` }, { status: failure.status }));
  const failures = [{ status: 401, message: 'Unauthorized' }, { status: 403, message: 'Forbidden' },
    { status: 200, message: 'READONLY cannot write with read-only token' },
    { status: 200, message: 'NOPERM command is not allowed' },
    { status: 500, message: 'Unexpected Redis failure' }];
  for (failure of failures) {
    const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false });
    await assertUnavailable(await guard.auth(authRequest('/api/auth/signin/google')));
  }
  assertLogs(['REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_OTHER']);
});

test('SDK fetch timeouts and aborts log only REDIS_TIMEOUT with the unchanged generic response', async context => {
  const assertLogs = captureLogs(context);
  let failure: Error = new DOMException(PRIVATE_DIAGNOSTIC, 'TimeoutError');
  context.mock.method(globalThis, 'fetch', async () => { throw failure; });
  for (failure of [new DOMException(PRIVATE_DIAGNOSTIC, 'TimeoutError'), new DOMException(PRIVATE_DIAGNOSTIC, 'AbortError'),
    Object.assign(new Error(PRIVATE_DIAGNOSTIC), { code: 'ETIMEDOUT' }),
    new Error(PRIVATE_DIAGNOSTIC, { cause: Object.assign(new Error(PRIVATE_DIAGNOSTIC), { code: 'UND_ERR_CONNECT_TIMEOUT' }) })]) {
    const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false });
    await assertUnavailable(await guard.account('POST', '/api/posts', ONE));
  }
  assertLogs(['REDIS_TIMEOUT', 'REDIS_TIMEOUT', 'REDIS_TIMEOUT', 'REDIS_TIMEOUT']);
});

test('SDK result, initialization and pending failures cannot leak private diagnostics', async context => {
  const assertLogs = captureLogs(context);
  const scenarios = [
    { result: { success: true, reset: 0, reason: 'timeout' as const }, reason: 'REDIS_TIMEOUT' },
    { result: { success: true, reset: Number.NaN }, reason: 'REDIS_OTHER' },
    { error: Object.assign(new Error(PRIVATE_DIAGNOSTIC), { status: 401 }), reason: 'REDIS_AUTH_OR_WRITE_FAILED' },
    { error: new Error(`WRONGPASS ${PRIVATE_DIAGNOSTIC}`), reason: 'REDIS_AUTH_OR_WRITE_FAILED' },
    { error: new Error(PRIVATE_DIAGNOSTIC), reason: 'REDIS_OTHER' },
    { error: PRIVATE_DIAGNOSTIC, reason: 'REDIS_OTHER' },
    { error: Object.assign(new Error(PRIVATE_DIAGNOSTIC), { name: 'UrlError' }), reason: 'CONFIG_INVALID' },
  ];
  for (const scenario of scenarios) {
    const limiter = { limit: async () => {
      if ('error' in scenario) throw scenario.error;
      return { ...scenario.result!, limit: 5, remaining: 0, pending: Promise.resolve() };
    } };
    const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false,
      createLimiters: () => ({ posts: limiter, comments: limiter, votes: limiter, username: limiter, auth: limiter }) });
    await assertUnavailable(await guard.account('POST', '/api/posts', ONE));
  }
  const initializationFailure = createRateLimitGuard({ environment: () => ENV, localDemo: () => false,
    createLimiters: () => { throw new Error(PRIVATE_DIAGNOSTIC); } });
  await assertUnavailable(await initializationFailure.account('POST', '/api/posts', ONE));
  const limiter = { limit: async () => ({ success: true, reset: 1, limit: 5, remaining: 0,
    pending: Promise.resolve().then(() => { throw new Error(`NOPERM ${PRIVATE_DIAGNOSTIC}`); }) }) };
  const pendingFailure = createRateLimitGuard({ environment: () => ENV, localDemo: () => false,
    createLimiters: () => ({ posts: limiter, comments: limiter, votes: limiter, username: limiter, auth: limiter }) });
  await assertUnavailable(await pendingFailure.account('POST', '/api/posts', ONE));
  assertLogs([...scenarios.map(scenario => scenario.reason), 'REDIS_OTHER', 'REDIS_AUTH_OR_WRITE_FAILED']);
});

test('an SDK timeout success cannot bypass limits; retry-after rounds up with a minimum of one', async context => {
  const assertLogs = captureLogs(context);
  const client = (result: { success: boolean; reset: number; reason?: 'timeout' }) => ({ limit: async () => ({ ...result, limit: 5, remaining: 0, pending: Promise.resolve() }) });
  for (const [result, status, retry] of [
    [{ success: true, reset: 0, reason: 'timeout' as const }, 503, '5'],
    [{ success: false, reset: 2501 }, 429, '2'],
    [{ success: false, reset: 0 }, 429, '1'],
  ] as const) {
    const limiter = client(result);
    const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false, now: () => 1001,
      createLimiters: () => ({ posts: limiter, comments: limiter, votes: limiter, username: limiter, auth: limiter }) });
    const response = await guard.account('POST', '/api/posts', ONE);
    assert.equal(response?.status, status);
    assert.equal(response?.headers.get('retry-after'), retry);
  }
  assertLogs(['REDIS_TIMEOUT']);
});

test('the explicit local demo stays offline and does not contact Redis', async (context) => {
  const assertLogs = captureLogs(context);
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error('No network expected'); });
  const guard = createRateLimitGuard({ environment: () => ({}), localDemo: () => true });
  assert.equal(await guard.account('POST', '/api/posts', ONE), null);
  assert.equal(await guard.auth(authRequest('/api/auth/signin/google')), null);
  assert.equal(fetch.mock.callCount(), 0);
  assertLogs([]);
});
