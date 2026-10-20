import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-700">
    <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-7 sm:p-10">
      <Link href="/" className="text-sm font-semibold text-indigo-600">College Forum</Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">Privacy at College Forum</h1>
      <div className="mt-7 space-y-6 text-sm leading-7">
        <section><h2 className="font-semibold text-slate-900">College account verification</h2><p>Sign-in is limited to verified, college-managed @rkgit.edu.in Google accounts. Google processes your sign-in. We use your email briefly to derive a stable anonymous account ID with a secret key, then discard the Google profile from the application session. Our forum database does not store your email, real name, profile picture, Google account ID, or IP address.</p></section>
        <section><h2 className="font-semibold text-slate-900">What the forum stores</h2><p>We store your anonymous account ID, permanent username, posts, comments, votes, timestamps, and security counters. Other signed-in members see your username and contributions. They do not receive your anonymous account ID. Your own account ID is included in your signed-in session.</p></section>
        <section><h2 className="font-semibold text-slate-900">Sessions and service providers</h2><p>An encrypted session cookie keeps you signed in for up to eight hours. Signing out removes the browser session. Google, Vercel, Render, and Supabase process data to provide sign-in, hosting, and database services; their infrastructure may retain network logs such as IP addresses.</p></section>
        <section><h2 className="font-semibold text-slate-900">An alias has limits</h2><p>This forum provides pseudonyms, not guaranteed anonymity. Your writing, timing, or details in a post can identify you. Someone with access to both the database and identity key could test email addresses for matches. Avoid posting contact details, real names, or private information about yourself or others.</p></section>
        <section><h2 className="font-semibold text-slate-900">Your contributions</h2><p>You can delete your own posts; their comments and votes are removed too. Account deletion and username changes are not available through the interface. For other privacy requests, contact the forum administrator through the campus channel where the forum was announced. Hosting backups may retain earlier copies according to the operator’s backup settings.</p></section>
        <section><h2 className="font-semibold text-slate-900">Local demo</h2><p>If you are using the explicitly labeled local demo, accounts are shared and data is saved on that computer. Shared demo accounts do not provide private identities.</p></section>
      </div>
      <Link href="/login" className="mt-8 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Back to sign-in</Link>
    </article>
  </main>;
}
