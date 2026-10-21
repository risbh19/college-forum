import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';
import { isLocalDemo } from './local-mode';

export const RATE_LIMITS = {
  posts: { limit: 5, window: '1 h' },
  comments: { limit: 20, window: '1 h' },
  votes: { limit: 60, window: '1 m' },
  username: { limit: 5, window: '1 h' },
  auth: { limit: 60, window: '1 m' },
} as const;

type Action = keyof typeof RATE_LIMITS;
const accountActions = new Map<string, Action>([
  ['/api/posts', 'posts'], ['/api/comments', 'comments'], ['/api/votes', 'votes'], ['/api/username', 'username'],
]);
type Environment = Record<string, string | undefined>;
type Limiters = Record<Action, Pick<Ratelimit, 'limit'>>;
type FailureReason = 'CONFIG_INVALID' | 'VERCEL_ENV_MISSING' | 'CLIENT_IP_HEADER_ABSENT' | 'CLIENT_IP_INVALID'
  | 'REDIS_TIMEOUT' | 'REDIS_AUTH_OR_WRITE_FAILED' | 'REDIS_OTHER';
type Options = {
  environment?: () => Environment;
  localDemo?: () => boolean;
  createLimiters?: (environment: Environment) => Limiters;
  now?: () => number;
};

function createUpstashLimiters(environment: Environment): Limiters {
  const redis = new Redis({
    url: environment.UPSTASH_REDIS_REST_URL!, token: environment.UPSTASH_REDIS_REST_TOKEN!,
    enableTelemetry: false, latencyLogging: false, enableAutoPipelining: false,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(2000),
  });
  const limiter = (action: Action) => new Ratelimit({
    redis, limiter: Ratelimit.slidingWindow(RATE_LIMITS[action].limit, RATE_LIMITS[action].window),
    prefix: `college-forum:ratelimit:v1:${action}`, analytics: false,
    enableTelemetry: false, enableProtection: false, ephemeralCache: false,
    // The SDK's default timeout allows requests. Disable it; Redis aborts and we return 503.
    timeout: 0,
  });
  return { posts: limiter('posts'), comments: limiter('comments'), votes: limiter('votes'), username: limiter('username'), auth: limiter('auth') };
}

function configuration(environment: Environment) {
  const url = new URL(environment.UPSTASH_REDIS_REST_URL ?? '');
  const token = environment.UPSTASH_REDIS_REST_TOKEN;
  const secret = environment.NEXTAUTH_SECRET;
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !token || /\s/.test(token) || !secret || secret.length < 32) throw new Error('Rate limiter unavailable');
  return { url: url.href, token, secret };
}

async function privateIdentifier(secret: string, action: Action, identity: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`ratelimit:${action}:${identity}`));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function canonicalIp(value: string | null): string {
  if (!value || value.length > 64) throw new Error('Client address unavailable');
  const ip = value.trim();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split('.');
    if (parts.some(part => Number(part) > 255 || String(Number(part)) !== part)) throw new Error('Client address unavailable');
    return ip;
  }
  if (!ip.includes(':') || /[^a-fA-F0-9:.]/.test(ip)) throw new Error('Client address unavailable');
  const normalized = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = normalized.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (mapped) {
    const first = parseInt(mapped[1], 16), last = parseInt(mapped[2], 16);
    return `${first >> 8}.${first & 255}.${last >> 8}.${last & 255}`;
  }
  return normalized;
}

/** Call only after verifying the server's VERCEL flag; never trust these on other hosts. */
function vercelClientIp(request: Request): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const value = request.headers.get(name);
    if (value === null || !value.trim()) continue;
    const first = value.split(',', 1)[0].trim();
    const ipv4Port = first.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
    if (ipv4Port && Number(ipv4Port[2]) > 65535) throw new Error('Invalid client address');
    // Invalid higher-priority headers fail closed; do not choose another identity.
    return canonicalIp(ipv4Port ? ipv4Port[1] : first);
  }
  return null;
}

function isLimitedAuthPath(path: string): boolean {
  if (!path.startsWith('/api/auth/')) return false;
  try {
    const action = decodeURIComponent(path.slice('/api/auth/'.length).split('/')[0]);
    return ['signin', 'callback', 'signout'].includes(action);
  } catch { return false; }
}

function redisFailureReason(error: unknown): FailureReason {
  try {
    // Inspect only to classify. SDK messages/causes may contain private request data.
    const failures = [error, error instanceof Error ? error.cause : undefined];
    for (const failure of failures) {
      if (!failure || typeof failure !== 'object') continue;
      const details = failure as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown };
      const message = typeof details.message === 'string' ? details.message : '';
      if (details.name === 'UrlError') return 'CONFIG_INVALID';
      if (details.name === 'TimeoutError' || details.name === 'AbortError'
        || (typeof details.code === 'string' && /^(?:ETIMEDOUT|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT)$/.test(details.code))
        || /\b(?:timeout|timed out)\b/i.test(message)) return 'REDIS_TIMEOUT';
      if (details.status === 401 || details.status === 403 || details.statusCode === 401 || details.statusCode === 403
        || /\b(?:unauthori[sz]ed|forbidden|wrongpass|noauth|noperm|readonly)\b|read[- ]only|(?:invalid|missing|expired)\s+(?:token|credentials?)|(?:permission|access)\s+denied|(?:authentication|authorization|write)\s+failed|command\s+(?:is\s+)?not\s+(?:allowed|permitted)/i.test(message)) {
        return 'REDIS_AUTH_OR_WRITE_FAILED';
      }
    }
  } catch { /* Unusual thrown values must never escape into diagnostics or responses. */ }
  return 'REDIS_OTHER';
}

function unavailable(reason: FailureReason) {
  // Exactly one fixed code: never include errors, configuration, addresses or IDs.
  console.error(reason);
  return Response.json({ error: 'Rate limiting temporarily unavailable. Try again shortly.' }, {
    status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'private, no-store' },
  });
}

/** Only HMAC identifiers are passed to Upstash. Never pass raw IPs, tokens or analytics options. */
export function createRateLimitGuard(options: Options = {}) {
  const environment = options.environment ?? (() => process.env);
  const localDemo = options.localDemo ?? isLocalDemo;
  const now = options.now ?? Date.now;
  let cached: { url: string; token: string; limiters: Limiters } | undefined;

  async function consume(action: Action, identity: string): Promise<Response | null> {
    let env: Environment;
    let config: ReturnType<typeof configuration>;
    try {
      env = environment();
      config = configuration(env);
    } catch { return unavailable('CONFIG_INVALID'); }
    try {
      if (!cached || cached.url !== config.url || cached.token !== config.token) {
        cached = { url: config.url, token: config.token, limiters: (options.createLimiters ?? createUpstashLimiters)(env) };
      }
      const result = await cached.limiters[action].limit(await privateIdentifier(config.secret, action, identity));
      await result.pending;
      if (result.reason === 'timeout') return unavailable('REDIS_TIMEOUT');
      if (!Number.isFinite(result.reset)) return unavailable('REDIS_OTHER');
      if (result.success) return null;
      return Response.json({ error: 'Too many requests. Try again shortly.' }, {
        status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((result.reset - now()) / 1000))), 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      return unavailable(redisFailureReason(error));
    }
  }

  return {
    async account(method: string, path: string, anonId: string): Promise<Response | null> {
      const action = accountActions.get(path);
      if (method !== 'POST' || !action || localDemo()) return null;
      if (!/^[a-f0-9]{32}$/.test(anonId)) return unavailable('CONFIG_INVALID');
      return consume(action, anonId);
    },
    async auth(request: Request): Promise<Response | null> {
      const path = new URL(request.url).pathname;
      if (!isLimitedAuthPath(path) || localDemo()) return null;
      let env: Environment;
      try { env = environment(); }
      catch { return unavailable('CONFIG_INVALID'); }
      // Vercel overwrites these forwarding headers. No header is trusted off-platform.
      if (env.VERCEL !== '1') return unavailable('VERCEL_ENV_MISSING');
      let ip: string | null;
      try { ip = vercelClientIp(request); }
      catch { return unavailable('CLIENT_IP_INVALID'); }
      if (ip === null) return unavailable('CLIENT_IP_HEADER_ABSENT');
      return consume('auth', ip);
    },
  };
}

export const rateLimits = createRateLimitGuard();
