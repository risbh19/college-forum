import { createHmac } from 'crypto';

/** Permanent anonymous identity. Keep the key secret and stable after launch. */
export function emailToAnonId(email: string): string {
  const pepper = process.env.ANON_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('ANON_PEPPER is missing or shorter than 32 characters');
  }
  return createHmac('sha256', pepper)
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 32);
}
