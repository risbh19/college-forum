import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { emailToAnonId } from './hash';
import { backendUsername } from './backend-client';
import { isLocalDemo, localAccountId, LOCAL_ACCOUNTS } from './local-mode';
import { COLLEGE_AUTH_POLICY, COLLEGE_DOMAIN, isCollegeProfile, isCurrentForumToken, LOCAL_AUTH_POLICY } from './access-policy';

async function usernameFor(anonId: string): Promise<string | null> {
  return backendUsername(anonId);
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
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
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
  // Provider failures can contain sensitive payloads. Keep application logging off.
  logger: {
    error() {},
    warn() {},
    debug() {},
  },
  debug: false,
  pages: { signIn: '/login', error: '/login' },
};
