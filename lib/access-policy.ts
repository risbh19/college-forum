import { isLocalDemo } from './local-mode';

export const COLLEGE_DOMAIN = 'rkgit.edu.in';
export const COLLEGE_AUTH_POLICY = 'rkgit-google-workspace-v1';
export const LOCAL_AUTH_POLICY = 'local-demo-v1';

export function adminLoginPolicy(): string | null {
  if (process.env.NODE_ENV !== 'production' || process.env.ADMIN_LOGIN_ENABLED !== '1'
    || !/^[a-f0-9]{32}$/.test(process.env.ADMIN_LOGIN_ACCOUNT_ID ?? '')
    || !/^[a-f0-9]{32}$/.test(process.env.ADMIN_LOGIN_VERSION ?? '')) return null;
  try {
    const web = new URL(process.env.NEXTAUTH_URL ?? '');
    const backend = new URL(process.env.BACKEND_URL ?? '');
    if ([web, backend].some(url => url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) return null;
  } catch { return null; }
  return `admin-password-v1:${process.env.ADMIN_LOGIN_VERSION}`;
}

export function isAdminLoginToken(token: { anonId?: unknown; authPolicy?: unknown } | null): boolean {
  const policy = adminLoginPolicy();
  return policy !== null && token?.authPolicy === policy && token.anonId === process.env.ADMIN_LOGIN_ACCOUNT_ID;
}

/** profile must come from NextAuth's validated Google ID token, never browser JSON. */
export function isCollegeProfile(profile: { email?: unknown; email_verified?: unknown; hd?: unknown } | undefined): boolean {
  if (typeof profile?.email !== 'string' || profile.email_verified !== true || profile.hd !== COLLEGE_DOMAIN) return false;
  const email = profile.email.trim().toLowerCase();
  return /^[^@\s]+@rkgit\.edu\.in$/.test(email);
}

/** A non-identifying policy version invalidates sessions issued before college verification. */
export function isCurrentForumToken(token: { anonId?: unknown; authPolicy?: unknown } | null): boolean {
  if (typeof token?.anonId !== 'string' || !/^[a-f0-9]{32}$/.test(token.anonId)) return false;
  return token.authPolicy === COLLEGE_AUTH_POLICY || isAdminLoginToken(token) || (token.authPolicy === LOCAL_AUTH_POLICY && isLocalDemo());
}
