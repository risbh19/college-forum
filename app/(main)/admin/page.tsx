import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { BackendError, backendRequest } from '@/lib/backend-client';
import ModerationButtons from '@/components/ui/ModerationButtons';
import type { ModerationItem } from '@/types';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect('/login');
  let queue: { items: ModerationItem[] };
  try { queue = await backendRequest(session.user.id, '/api/admin/reports'); }
  catch (error) { if (error instanceof BackendError && error.status === 403) notFound(); throw error; }
  return <section className="space-y-5">
    <h1 className="text-xl font-bold">Moderation</h1>
    <p className="text-sm text-slate-500">Latest 100 reported items. Content is hidden after three distinct reports. Reporter identities are never displayed.</p>
    {!queue.items.length && <p className="text-sm text-slate-500">No reports to review.</p>}
    {queue.items.map(item => <article key={`${item.kind}-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{item.kind === 'posts' ? 'Post' : 'Comment'} · {item.hidden ? 'Hidden' : 'Visible'} · {item.reportCount} reports</p>
      {item.title && <h2 className="mt-2 break-words font-semibold">{item.title}</h2>}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.body}</p>
      <ul className="mt-3 list-inside list-disc text-xs text-slate-500">{item.reasons.map((reason, index) => <li key={index} className="break-words">{reason}</li>)}</ul>
      <ModerationButtons id={item.id} kind={item.kind} hidden={item.hidden} />
    </article>)}
  </section>;
}
