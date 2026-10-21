import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { emailToAnonId } from './hash';
import { backendUsername } from './backend-client';
import { isLocalDemo, localAccountId, LOCAL_ACCOUNTS } from './local-mode';
import { COLLEGE_AUTH_POLICY, COLLEGE_DOMAIN, isCollegeProfile, isCurrentForumToken, LOCAL_AUTH_POLICY } from './access-policy';

type AuthFailureReason = 'OAUTH_TOKEN_EXCHANGE_FAILED' | 'OAUTH_STATE_OR_PKCE'
  | 'OAUTH_ID_TOKEN_INVALID' | 'BACKEND_USERNAME_LOOKUP_FAILED' | 'OTHER';

const authFailureCodes = new Map<string, AuthFailureReason>([
  ['OAUTH_GET_ACCESS_TOKEN_ERROR', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['OAUTH_V1_GET_ACCESS_TOKEN_ERROR', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['OPError', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['invalid_client', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['invalid_grant', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['unauthorized_client', 'OAUTH_TOKEN_EXCHANGE_FAILED'],
  ['PKCE_ERROR', 'OAUTH_STATE_OR_PKCE'],
  ['STATE_ERROR', 'OAUTH_STATE_OR_PKCE'],
  ['PKCEError', 'OAUTH_STATE_OR_PKCE'],
  ['StateError', 'OAUTH_STATE_OR_PKCE'],
  ['JWTClaimValidationFailed', 'OAUTH_ID_TOKEN_INVALID'],
  ['JWTExpired', 'OAUTH_ID_TOKEN_INVALID'],
  ['JWTInvalid', 'OAUTH_ID_TOKEN_INVALID'],
  ['JWSSignatureVerificationFailed', 'OAUTH_ID_TOKEN_INVALID'],
  ['ERR_JWT_CLAIM_VALIDATION_FAILED', 'OAUTH_ID_TOKEN_INVALID'],
  ['ERR_JWT_EXPIRED', 'OAUTH_ID_TOKEN_INVALID'],
  ['ERR_JWT_INVALID', 'OAUTH_ID_TOKEN_INVALID'],
  ['ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'OAUTH_ID_TOKEN_INVALID'],
  ['BackendUsernameLookupError', 'BACKEND_USERNAME_LOOKUP_FAILED'],
  ['BACKEND_USERNAME_LOOKUP_FAILED', 'BACKEND_USERNAME_LOOKUP_FAILED'],
]);

function authFailureReason(code: string, metadata: unknown): AuthFailureReason {
  const failures: unknown[] = [metadata];
  // Read only names/codes from bounded error/cause wrappers, never payloads or messages.
  for (let index = 0; index < failures.length && index < 6; index++) {
    const failure = failures[index];
    if (!failure || typeof failure !== 'object') continue;
    try {
      const details = failure as { name?: unknown; code?: unknown; error?: unknown; cause?: unknown };
      for (const hint of [details.code, details.name]) {
        if (typeof hint !== 'string') continue;
        const reason = authFailureCodes.get(hint);
        if (reason) return reason;
      }
      failures.push(details.error, details.cause);
    } catch { /* Malformed diagnostics must not break the logger or disclose data. */ }
  }
  // Ambiguous NextAuth wrappers remain OTHER; never infer a cause from message text.
  return authFailureCodes.get(code) ?? 'OTHER';
}

class BackendUsernameLookupError extends Error {
  readonly code = 'BACKEND_USERNAME_LOOKUP_FAILED';
  constructor() {
    super('Username lookup unavailable');
    this.name = 'BackendUsernameLookupError';
  }
}

async function usernameFor(anonId: string): Promise<string | null> {
  try { return await backendUsername(anonId); }
  catch { throw new BackendUsernameLookupError(); }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(isLocalDemo() ? [CredentialsProvider({
      id: 'local-demo',
      name: 'Local demo',
      credentials: { account: { label: 'Demo account', type: 'text' } },
      async authorize(credentials) {
        if (!isLocalDemo()) return null;
        const id = localAccountId(credentials?.account);
        return id ? { id } : null;
      },
    })] : []),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: { params: { scope: 'openid email profile', hd: COLLEGE_DOMAIN, prompt: 'select_account' } },
      checks: ['pkce', 'state', 'nonce'],
    }),
  ],
  useSecureCookies: process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://'),
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  jwt: { maxAge: 7 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ profile, account, user }) {
      if (account?.provider === 'local-demo') {
        return isLocalDemo() && Object.values(LOCAL_ACCOUNTS).some((id) => id === user.id);
      }
      return account?.provider === 'google' && isCollegeProfile(profile);
    },
    async jwt({ token, profile, trigger, account, user }) {
      if (account?.provider === 'local-demo' && user && isLocalDemo()
        && Object.values(LOCAL_ACCOUNTS).some((id) => id === user.id)) {
        return { anonId: user.id, username: await usernameFor(user.id), authPolicy: LOCAL_AUTH_POLICY };
      }
      if (profile?.email) {
        if (account?.provider !== 'google' || !isCollegeProfile(profile)) return {};
        const anonId = emailToAnonId(profile.email);
        // Never preserve the default provider token's identity fields.
        return { anonId, username: await usernameFor(anonId), authPolicy: COLLEGE_AUTH_POLICY };
      }

      if (!isCurrentForumToken(token)) return {};

      const anonId = typeof token.anonId === 'string' ? token.anonId : undefined;
      let username = typeof token.username === 'string' ? token.username : null;
      if (anonId && (trigger === 'update' || !username)) {
        // Client update() data is untrusted; read the immutable username from the DB.
        username = await usernameFor(anonId);
      }
      // Sanitize subsequent calls and old tokens as well as initial sign-in.
      return { anonId, username, authPolicy: token.authPolicy };
    },
    async session({ session, token }) {
      if (!isCurrentForumToken(token)) return { expires: session.expires, user: { id: '', username: null } };
      return {
        expires: session.expires,
        user: { id: token.anonId ?? '', username: token.username ?? null },
      };
    },
  },
  // Provider failures can contain sensitive payloads. Emit only a fixed reason code.
  logger: {
    error(code, metadata) { console.error(authFailureReason(code, metadata)); },
    warn() {},
    debug() {},
  },
  debug: false,
  pages: { signIn: '/login', error: '/login' },
};
