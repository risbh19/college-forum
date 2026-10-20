import { createHash, createHmac, randomUUID } from 'node:crypto';

export function signBackendAssertion(viewerId: string, method: string, path: string, body = '', scope = 'forum'): string {
  const key = process.env.BACKEND_SHARED_SECRET;
  if (!key || key.length < 32 || !/^[a-f0-9]{32}$/.test(viewerId)) throw new Error('Backend authentication is not configured');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    sub: viewerId, scope, method, path,
    bodyHash: createHash('sha256').update(body).digest('hex'),
    iat: now, nbf: now, exp: now + 20, jti: randomUUID(),
    iss: 'college-forum-web', aud: 'college-forum-api',
  };
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  return `${message}.${createHmac('sha256', key).update(message).digest('base64url')}`;
}
