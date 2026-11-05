'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { adminLoginSchema } from '@/lib/admin-login-schema';

export default function AdminLogin() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = adminLoginSchema.safeParse({ username: data.get('username'), password: data.get('password') });
    if (!input.success) { setError('Enter a valid username and password.'); return; }
    setPending(true); setError('');
    try {
      const response = await signIn('admin-login', { ...input.data, callbackUrl: '/admin', redirect: false });
      if (!response?.ok || response.error) { setError('Sign-in failed. Check your credentials or try again later.'); return; }
      window.location.assign('/admin');
    } catch { setError('Sign-in is temporarily unavailable. Try again later.'); }
    finally { form.reset(); setPending(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-5">
    <label className="block text-sm font-medium text-ink">Username<input required name="username" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" className="mt-2 w-full rounded-lg border border-control px-3 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    <label className="block text-sm font-medium text-ink">Password<input required name="password" type="password" autoComplete="current-password" maxLength={1024} className="mt-2 w-full rounded-lg border border-control px-3 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm leading-5 text-red-700">{error}</p>}
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{pending ? 'Signing in…' : 'Sign in to admin portal'}</button>
  </form>;
}
