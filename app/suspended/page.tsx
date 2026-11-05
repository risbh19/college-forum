import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { BackendError, backendRequest } from '@/lib/backend-client';

export default async function SuspendedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect('/login');
  let suspended = false;
  try { await backendRequest(session.user.id, '/api/admin/status'); }
  catch (error) {
    if (error instanceof BackendError && error.status === 403 && error.message === 'Your account is suspended') suspended = true;
    else throw error;
  }
  if (!suspended) redirect('/');
  return <main className="mx-auto max-w-lg px-6 py-24"><div className="rounded-2xl border border-amber-200 bg-white p-8"><h1 className="text-2xl font-bold text-ink">Your account is suspended</h1><p className="mt-4 text-sm leading-6 text-muted">Forum access is temporarily unavailable for this username. Contact the forum administrator through your campus support channel to request a review.</p><div className="mt-6 flex gap-5 text-sm text-indigo-600"><Link href="/">Check access again</Link><Link href="/api/auth/signout" prefetch={false}>Sign out</Link></div></div></main>;
}
