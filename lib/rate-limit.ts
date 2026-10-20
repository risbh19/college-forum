import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';
import { isLocalDemo } from './local-mode';

export const RATE_LIMITS = {
  posts: { limit: 5, window: '1 h' },
  comments: { limit: 20, window: '1 h' },
  votes: { limit: 60, window: '1 m' },
  username: { limit: 5, window: '1 h' },
  auth: { limit: 20, window: '1 m' },
} as const;

type Action = keyof typeof RATE_LIMITS;
const accountActions = new Map<string, Action>([
  ['/api/posts', 'posts'], ['/api/comments', 'comments'], ['/api/votes', 'votes'], ['/api/username', 'username'],
]);
type Environment = Record<string, string | undefined>;
type Limiters = Record<Action, Pick<Ratelimit, 'limit'>>;
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

function unavailable() {
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
    try {
      const env = environment();
      const config = configuration(env);
      if (!cached || cached.url !== config.url || cached.token !== config.token) {
        cached = { url: config.url, token: config.token, limiters: (options.createLimiters ?? createUpstashLimiters)(env) };
      }
      const result = await cached.limiters[action].limit(await privateIdentifier(config.secret, action, identity));
      await result.pending;
      if (result.reason === 'timeout' || !Number.isFinite(result.reset)) return unavailable();
      if (result.success) return null;
      return Response.json({ error: 'Too many requests. Try again shortly.' }, {
        status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((result.reset - now()) / 1000))), 'Cache-Control': 'private, no-store' },
      });
    } catch {
      // SDK errors can contain credentials or request data. Do not log or return them.
      return unavailable();
    }
  }

  return {
    async account(method: string, path: string, anonId: string): Promise<Response | null> {
      const action = accountActions.get(path);
      if (method !== 'POST' || !action || localDemo()) return null;
      if (!/^[a-f0-9]{32}$/.test(anonId)) return unavailable();
      return consume(action, anonId);
    },
    async auth(request: Request): Promise<Response | null> {
      const path = new URL(request.url).pathname;
      if (!(path === '/api/auth' || path.startsWith('/api/auth/')) || localDemo()) return null;
      try {
        // Only Vercel's overwritten header is trusted. Never fall back to caller-supplied forwarding headers.
        if (environment().VERCEL !== '1') return unavailable();
        return consume('auth', canonicalIp(request.headers.get('x-vercel-forwarded-for')));
      } catch { return unavailable(); }
    },
  };
}

export const rateLimits = createRateLimitGuard();
