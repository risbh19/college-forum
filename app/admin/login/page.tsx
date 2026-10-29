import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminLogin from '@/components/auth/AdminLogin';
import { adminLoginPolicy } from '@/lib/access-policy';

export const metadata = { title: 'Admin login', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  if (!adminLoginPolicy()) notFound();
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">College Forum</p><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Admin sign in</h1><p className="mt-3 text-sm leading-6 text-slate-500">Use your dedicated administrator credentials to manage the forum.</p><AdminLogin /><p className="mt-6 text-center text-xs text-slate-500">Student? <Link href="/login" className="font-medium text-indigo-600">Continue with college Google login</Link></p></section></main>;
}
