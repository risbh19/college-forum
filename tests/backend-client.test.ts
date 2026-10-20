import assert from 'node:assert/strict';
import test from 'node:test';
import { backendRequest } from '../lib/backend-client';

test('backend client sanitizes upstream error strings, non-JSON failures and retry headers', async context => {
  const previousSecret = process.env.BACKEND_SHARED_SECRET;
  const previousUrl = process.env.BACKEND_URL;
  process.env.BACKEND_SHARED_SECRET = 'synthetic-backend-client-test-secret-32';
  process.env.BACKEND_URL = 'https://backend.example.invalid';
  context.after(() => {
    if (previousSecret === undefined) delete process.env.BACKEND_SHARED_SECRET; else process.env.BACKEND_SHARED_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.BACKEND_URL; else process.env.BACKEND_URL = previousUrl;
  });
  for (const [status, expected] of [[500, 'Service temporarily unavailable'], [400, 'Invalid input'], [403, 'Access denied']] as const) {
    const mock = context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'SQL credentials synthetic-token and userId synthetic-id' }, { status }));
    await assert.rejects(backendRequest('a'.repeat(32), '/api/posts'), { status, message: expected });
    mock.mock.restore();
  }
  const mock = context.mock.method(globalThis, 'fetch', async () => new Response('<html>private stack trace</html>', { status: 502 }));
  await assert.rejects(backendRequest('a'.repeat(32), '/api/posts'), { status: 503, message: 'Service temporarily unavailable' });
  mock.mock.restore();
  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': '45' } }));
  await assert.rejects(backendRequest('a'.repeat(32), '/api/posts'), { status: 429, retryAfter: '45' });
});
