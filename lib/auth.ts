import type { NextAuthOptions } from 'next-auth';
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { emailToAnonId } from './hash';
import { prisma } from './db';
import { isLocalDemo, localAccountId, LOCAL_ACCOUNTS } from './local-mode';

async function usernameFor(anonId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: anonId },
    select: { username: true },
  });
  return user?.username ?? null;
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
      authorization: { params: { scope: 'openid email profile' } },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ profile, account, user }) {
      if (account?.provider === 'local-demo') {
        return isLocalDemo() && Object.values(LOCAL_ACCOUNTS).some((id) => id === user.id);
      }
      const google = profile as GoogleProfile | undefined;
      if (!google?.email || google.email_verified !== true) return false;
      const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
      if (domain && !google.email.trim().toLowerCase().endsWith(`@${domain}`)) return false;
      return true;
    },
    async jwt({ token, profile, trigger, account, user }) {
      if (account?.provider === 'local-demo' && user && isLocalDemo()
        && Object.values(LOCAL_ACCOUNTS).some((id) => id === user.id)) {
        return { anonId: user.id, username: await usernameFor(user.id) };
      }
      if (profile?.email) {
        const anonId = emailToAnonId(profile.email);
        // Never preserve the default provider token's identity fields.
        return { anonId, username: await usernameFor(anonId) };
      }

      const anonId = typeof token.anonId === 'string' ? token.anonId : undefined;
      let username = typeof token.username === 'string' ? token.username : null;
      if (anonId && (trigger === 'update' || !username)) {
        // Client update() data is untrusted; read the immutable username from the DB.
        username = await usernameFor(anonId);
      }
      // Sanitize subsequent calls and old tokens as well as initial sign-in.
      return { anonId, username };
    },
    async session({ session, token }) {
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
