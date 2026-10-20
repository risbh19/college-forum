import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../lib/api';
import { MAX_JSON_BYTES } from '../lib/gateway-security';

function request(body: string, length?: string) {
  return new Request('http://localhost/api/posts', { method: 'POST', body, headers: length ? { 'content-length': length } : {} });
}

test('readJson enforces 20KB of actual bytes before JSON parsing even without a truthful Content-Length', async () => {
  const exact = JSON.stringify('x'.repeat(MAX_JSON_BYTES - 2));
  assert.equal((await readJson(request(exact)) as string).length, MAX_JSON_BYTES - 2);
  for (const length of [undefined, '1', '-1', 'invalid']) {
    await assert.rejects(readJson(request(exact + ' ', length)), { status: 413 });
  }
  await assert.rejects(readJson(request('{}', String(MAX_JSON_BYTES + 1))), { status: 413 });
  await assert.rejects(readJson(request(JSON.stringify('😀'.repeat(6000)))), { status: 413 });
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(MAX_JSON_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close();
  } });
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)), { status: 413 });
  await assert.rejects(readJson(request('{"private":"synthetic-secret",broken}')), { status: 400, message: 'Invalid JSON' });
})
