import assert from 'node:assert/strict';
import test from 'node:test';
import { productionErrors } from '../scripts/check-production.mjs';

const configured = {
  GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-oauth-secret',
  NEXTAUTH_SECRET: 'synthetic-session-secret-at-least-32-chars',
  ANON_PEPPER: 'synthetic-identity-secret-at-least-32-chars',
  BACKEND_SHARED_SECRET: 'synthetic-service-secret-at-least-32-chars',
  NEXTAUTH_URL: 'https://forum.rkgit.edu.in', BACKEND_URL: 'https://api.rkgit.edu.in',
  COLLEGE_FORUM_LOCAL: '0', ALLOWED_EMAIL_DOMAIN: 'rkgit.edu.in',
  UPSTASH_REDIS_REST_URL: 'https://synthetic.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'synthetic-private-token', VERCEL: '1',
};

test('production checks reject missing secrets without echoing values', () => {
  assert.deepEqual(productionErrors(configured), []);
  const errors = productionErrors({ ...configured, NEXTAUTH_SECRET: 'private-short-value' });
  assert.ok(errors.some(error => error.includes('NEXTAUTH_SECRET')));
  assert.ok(!JSON.stringify(errors).includes('private-short-value'));
  assert.ok(productionErrors({}).length > 0);
});

test('production checks reject insecure origins, demo access and reused secrets', () => {
  for (const url of ['http://forum.rkgit.edu.in', 'https://localhost', 'https://user:pass@forum.rkgit.edu.in', 'https://forum.rkgit.edu.in/path', 'https://forum.rkgit.edu.in/?token=x']) {
    assert.ok(productionErrors({ ...configured, NEXTAUTH_URL: url }).length > 0);
  }
  assert.ok(productionErrors({ ...configured, BACKEND_URL: configured.NEXTAUTH_URL }).length > 0);
  assert.ok(productionErrors({ ...configured, COLLEGE_FORUM_LOCAL: '1' }).length > 0);
  assert.ok(productionErrors({ ...configured, BACKEND_SHARED_SECRET: configured.NEXTAUTH_SECRET }).length > 0);
  assert.ok(productionErrors({ ...configured, ALLOWED_EMAIL_DOMAIN: 'gmail.com' }).length > 0);
  assert.ok(productionErrors({ ...configured, UPSTASH_REDIS_REST_URL: 'http://unsafe.invalid' }).length > 0);
  assert.ok(productionErrors({ ...configured, UPSTASH_REDIS_REST_TOKEN: '' }).length > 0);
  assert.ok(productionErrors({ ...configured, VERCEL: undefined }).length > 0);
});
