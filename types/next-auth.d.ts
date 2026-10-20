import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: { id: string; username: string | null };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    anonId?: string;
    username?: string | null;
    authPolicy?: string;
  }
}
