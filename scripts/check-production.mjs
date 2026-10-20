import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Check names/constraints only. Never emit an environment value.
 * @param {Record<string, string | undefined>} environment
 */
export function productionErrors(environment) {
  const errors = [];
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXTAUTH_SECRET', 'ANON_PEPPER', 'BACKEND_SHARED_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (!environment[name]?.trim()) errors.push(`${name} is required`);
  }
  const secrets = ['NEXTAUTH_SECRET', 'ANON_PEPPER', 'BACKEND_SHARED_SECRET'];
  for (const name of secrets) if ((environment[name]?.length ?? 0) < 32) errors.push(`${name} must have at least 32 characters`);
  if (new Set(secrets.map(name => environment[name])).size !== 3) errors.push('Session, identity and service secrets must be independent');
  for (const name of ['NEXTAUTH_URL', 'BACKEND_URL']) {
    try {
      const value = new URL(environment[name] ?? '');
      if (value.protocol !== 'https:' || value.username || value.password || value.pathname !== '/' || value.search || value.hash
        || ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)) throw new Error();
    } catch { errors.push(`${name} must be an exact public HTTPS origin`); }
  }
  if (environment.NEXTAUTH_URL && environment.NEXTAUTH_URL === environment.BACKEND_URL) errors.push('Frontend and FastAPI must use separate service origins');
  if (environment.COLLEGE_FORUM_LOCAL && environment.COLLEGE_FORUM_LOCAL !== '0') errors.push('COLLEGE_FORUM_LOCAL must be 0 in production');
  if (environment.ALLOWED_EMAIL_DOMAIN && environment.ALLOWED_EMAIL_DOMAIN !== 'rkgit.edu.in') errors.push('ALLOWED_EMAIL_DOMAIN cannot override the fixed college policy');
  try {
    const redis = new URL(environment.UPSTASH_REDIS_REST_URL ?? '');
    if (redis.protocol !== 'https:' || redis.username || redis.password || redis.pathname !== '/' || redis.search || redis.hash) throw new Error();
  } catch { errors.push('UPSTASH_REDIS_REST_URL must be an exact HTTPS Redis REST origin'); }
  if (/\s/.test(environment.UPSTASH_REDIS_REST_TOKEN ?? '')) errors.push('UPSTASH_REDIS_REST_TOKEN must not contain whitespace');
  if (environment.VERCEL !== '1') errors.push('VERCEL must be 1 for trusted auth IP rate limiting');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = productionErrors(process.env);
  if (errors.length) {
    console.error('Production configuration rejected:\n' + errors.map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else console.log('Production frontend configuration passed. College-only access is enforced in code.');
}
