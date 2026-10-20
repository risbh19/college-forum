import assert from 'node:assert/strict';
import test from 'node:test';

test('next.config supplies all requested security headers with a self-only CSP and Google OAuth form destination', async () => {
  const configPath = '../next.config.mjs';
  const { default: config } = await import(configPath) as { default: { headers(): Promise<{ source: string; headers: { key: string; value: string }[] }[]> } };
  const [rule] = await config.headers();
  assert.equal(rule.source, '/:path*');
  const headers = Object.fromEntries(rule.headers.map(header => [header.key, header.value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(headers['Permissions-Policy'], /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
  assert.match(headers['Content-Security-Policy'], /form-action 'self' https:\/\/accounts\.google\.com/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-eval|script-src[^;]*unsafe-inline|https:\/\/\*/);
})
