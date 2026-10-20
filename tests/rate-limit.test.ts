import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { createRateLimitGuard } from '../lib/rate-limit';

const ONE = 'a'.repeat(32), TWO = 'b'.repeat(32);
const SECRET = 'synthetic-private-rate-limit-key-at-least-32';
const TOKEN = 'synthetic-upstash-token-never-for-production';
const ENV = { NEXTAUTH_SECRET: SECRET, UPSTASH_REDIS_REST_URL: 'https://synthetic.upstash.io', UPSTASH_REDIS_REST_TOKEN: TOKEN, VERCEL: '1' };
const FAILURE_CODES = ['CONFIG_INVALID', 'VERCEL_ENV_MISSING', 'CLIENT_IP_MISSING', 'REDIS_TIMEOUT', 'REDIS_AUTH_OR_WRITE_FAILED', 'REDIS_OTHER'] as const;
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

test('all auth methods/subroutes share 20/min per trusted IP; unrelated paths do not count', async (context) => {
  const { guard, seen, advance } = fixture(context);
  for (let index = 0; index < 20; index++) {
    assert.equal(await guard.auth(authRequest(['/api/auth', '/api/auth/csrf', '/api/auth/session', '/api/auth/callback/google'][index % 4], '192.0.2.1', index % 2 ? 'POST' : 'GET')), null);
  }
  const blocked = await guard.auth(authRequest('/api/auth/signin/google'));
  assert.equal(blocked?.status, 429);
  assert.equal(blocked?.headers.get('retry-after'), '60');
  assert.equal(await guard.auth(authRequest('/api/auth/session', '192.0.2.2')), null);
  assert.equal(await guard.auth(authRequest('/api/authentication')), null);
  assert.ok(seen.every(call => call.limit === 20 && call.window === 60_000));
  advance(60_001);
  assert.equal(await guard.auth(authRequest('/api/auth/session')), null);
});

test('IP spelling and caller-supplied forwarding headers cannot rotate the bucket', async (context) => {
  const { guard, seen } = fixture(context);
  const assertLogs = captureLogs(context);
  await guard.auth(authRequest('/api/auth/session', '2001:0db8:0:0:0:0:0:1'));
  await guard.auth(authRequest('/api/auth/session', '2001:db8::1'));
  assert.equal(seen[0].key, seen[1].key);
  await guard.auth(authRequest('/api/auth/session', '192.0.2.1'));
  await guard.auth(authRequest('/api/auth/session', '::ffff:192.0.2.1'));
  assert.equal(seen[2].key, seen[3].key);
  const spoofed = new Request('https://forum.example/api/auth/session', { headers: { 'x-forwarded-for': '192.0.2.99', 'x-real-ip': '192.0.2.99' } });
  assert.equal((await guard.auth(spoofed))?.status, 503);
  for (const ip of ['192.0.2.1, 192.0.2.2', '999.0.0.1', '0192.0.2.1', 'bad-address']) assert.equal((await guard.auth(authRequest('/api/auth/session', ip)))?.status, 503);
  const untrusted = createRateLimitGuard({ environment: () => ({ ...ENV, VERCEL: '' }), localDemo: () => false });
  assert.equal((await untrusted.auth(authRequest('/api/auth/session')))?.status, 503);
  assertLogs(['CLIENT_IP_MISSING', 'CLIENT_IP_MISSING', 'CLIENT_IP_MISSING', 'CLIENT_IP_MISSING', 'CLIENT_IP_MISSING', 'VERCEL_ENV_MISSING']);
});

test('only namespaced HMAC keys reach Redis; SDK analytics and telemetry stay disabled', async (context) => {
  const { guard, seen } = fixture(context);
  await guard.account('POST', '/api/posts', ONE);
  await guard.auth(authRequest('/api/auth/session'));
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
  const result = await guard.auth(authRequest('/api/auth/session'));
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
    await assertUnavailable(await guard.auth(authRequest('/api/auth/session')));
    expected.push('VERCEL_ENV_MISSING');
  }
  const guard = createRateLimitGuard({ environment: () => ENV, localDemo: () => false });
  const missingIp = new Request('https://forum.example/api/auth/session', { headers: { 'x-forwarded-for': '192.0.2.1' } });
  await assertUnavailable(await guard.auth(missingIp));
  expected.push('CLIENT_IP_MISSING');
  for (const ip of ['', '999.0.0.1', '192.0.2.1, 192.0.2.2', `${TOKEN}:2001:db8::1`]) {
    await assertUnavailable(await guard.auth(authRequest('/api/auth/session', ip)));
    expected.push('CLIENT_IP_MISSING');
  }
  await assertUnavailable(await guard.account('POST', '/api/posts', PRIVATE_DIAGNOSTIC));
  expected.push('CONFIG_INVALID');
  const unavailableEnvironment = createRateLimitGuard({ environment: () => { throw new Error(PRIVATE_DIAGNOSTIC); }, localDemo: () => false });
  await assertUnavailable(await unavailableEnvironment.auth(authRequest('/api/auth/session')));
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
    await assertUnavailable(await guard.auth(authRequest('/api/auth/session')));
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
  assert.equal(await guard.auth(authRequest('/api/auth/session')), null);
  assert.equal(fetch.mock.callCount(), 0);
  assertLogs([]);
});
