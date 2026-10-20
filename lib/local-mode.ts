/** Local accounts are available only in development against our loopback DB. */
export function isLocalDemo(): boolean {
  if (process.env.NODE_ENV !== 'development' || process.env.COLLEGE_FORUM_LOCAL !== '1') return false;
  try {
    const app = new URL(process.env.NEXTAUTH_URL ?? '');
    const backend = new URL(process.env.BACKEND_URL ?? '');
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
    return app.protocol === 'http:' && loopback.has(app.hostname)
      && backend.protocol === 'http:' && loopback.has(backend.hostname)
      && backend.pathname === '/' && !backend.username && !backend.password && !backend.search && !backend.hash
      && app.pathname === '/' && !app.username && !app.password && !app.search && !app.hash;
  } catch {
    return false;
  }
}

/** Synthetic local identities; never used by the Google production provider. */
export const LOCAL_ACCOUNTS = {
  'student-one': '11111111111111111111111111111111',
  'student-two': '22222222222222222222222222222222',
  'new-student': '33333333333333333333333333333333',
} as const;

export function localAccountId(account: unknown): string | null {
  if (typeof account !== 'string' || !Object.hasOwn(LOCAL_ACCOUNTS, account)) return null;
  return LOCAL_ACCOUNTS[account as keyof typeof LOCAL_ACCOUNTS];
}
