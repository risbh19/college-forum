import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { boundedBody, requireSameOrigin } from '../lib/gateway-security';
import { signBackendAssertion } from '../lib/backend-assertion';

test('service assertions bind identity, method, path, body and short lifetime', () => {
  const old = process.env.BACKEND_SHARED_SECRET;
  const key = 'synthetic-test-service-key-at-least-32-characters';
  process.env.BACKEND_SHARED_SECRET = key;
  try {
    const token = signBackendAssertion('a'.repeat(32), 'POST', '/api/posts', '{"title":"Hello"}');
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.equal(signature, createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url'));
    assert.equal(claims.bodyHash, createHash('sha256').update('{"title":"Hello"}').digest('hex'));
    assert.equal(claims.method, 'POST'); assert.equal(claims.path, '/api/posts');
    assert.equal(claims.exp - claims.iat, 20);
    assert.deepEqual(Object.keys(claims).sort(), ['sub','scope','method','path','bodyHash','iat','nbf','exp','jti','iss','aud'].sort());
    assert.throws(() => signBackendAssertion('attacker', 'GET', '/api/posts'));
    process.env.BACKEND_SHARED_SECRET = 'short';
    assert.throws(() => signBackendAssertion('a'.repeat(32), 'GET', '/api/posts'));
  } finally { if (old === undefined) delete process.env.BACKEND_SHARED_SECRET; else process.env.BACKEND_SHARED_SECRET = old; }
});

test('gateway rejects missing, deceptive and cross-site origins', () => {
  for (const origin of ['', 'null', 'https://forum.example.attacker.invalid', 'https://attacker.invalid']) {
    assert.throws(() => requireSameOrigin(new Request('https://forum.example/api/posts', { headers: { origin } }), 'https://forum.example'));
  }
  requireSameOrigin(new Request('https://forum.example/api/posts', { headers: { origin: 'https://forum.example' } }), 'https://forum.example');
  assert.throws(() => requireSameOrigin(new Request('https://forum.example/api/posts', { headers: { origin: 'https://forum.example', 'sec-fetch-site': 'cross-site' } }), 'https://forum.example'));
});

test('gateway bounds chunked bodies and total read time', async () => {
  assert.equal(await boundedBody(new Request('http://localhost', { method: 'POST', body: 'hello' })), 'hello');
  await assert.rejects(boundedBody(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(65537) })), { status: 413 });
  const slow = new ReadableStream<Uint8Array>({ start() {} });
  const request = new Request('http://localhost', { method: 'POST', body: slow, duplex: 'half' } as RequestInit);
  await assert.rejects(boundedBody(request, 20), { status: 408 });
});
