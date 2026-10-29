import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { BackendError, backendRequest } from '@/lib/backend-client';
import ModerationButtons from '@/components/ui/ModerationButtons';
import SuspensionButton from '@/components/auth/SuspensionButton';
import { BOARDS } from '@/lib/boards';
import type { AdminOverview, AdminContentPage, AdminAccountsPage, ModerationItem } from '@/types';

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect('/login');
  if (!session.user.username) redirect('/setup-username');
  const search = await searchParams;
  const value = (key: string) => typeof search[key] === 'string' ? search[key] as string : '';
  const tab = ['posts', 'comments', 'accounts'].includes(value('tab')) ? value('tab') : 'reports';
  const q = value('q').slice(0, tab === 'accounts' ? 20 : 150);
  const board = BOARDS.some(item => item.slug === value('board')) ? value('board') : '';
  const visibility = ['visible', 'hidden'].includes(value('visibility')) ? value('visibility') : 'all';
  const requestedPage = Number(value('page'));
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1;
  const query = new URLSearchParams({ q, page: String(page) });
  if (tab !== 'accounts') { query.set('kind', tab); query.set('visibility', visibility); if (board) query.set('board', board); }
  let overview: AdminOverview;
  let queue: { items: ModerationItem[] } = { items: [] };
  let content: AdminContentPage = { items: [], hasMore: false };
  let accounts: AdminAccountsPage = { items: [], hasMore: false };
  try {
    overview = await backendRequest<AdminOverview>(session.user.id, '/api/admin/overview');
    if (tab === 'reports') queue = await backendRequest(session.user.id, '/api/admin/reports');
    else if (tab === 'accounts') accounts = await backendRequest(session.user.id, `/api/admin/accounts?${query}`);
    else content = await backendRequest(session.user.id, `/api/admin/content?${query}`);
  }
  catch (error) { if (error instanceof BackendError && error.status === 403) notFound(); throw error; }
  const pageUrl = (next: number) => `/admin?${new URLSearchParams({ tab, q, board, visibility, page: String(next) })}`;
  const hasMore = tab === 'accounts' ? accounts.hasMore : content.hasMore;
  const stats = [['Members', overview.members], ['Suspended', overview.suspendedMembers], ['Posts', overview.posts], ['Comments', overview.comments], ['Hidden content', overview.hiddenPosts + overview.hiddenComments], ['Reported items', overview.reportedItems]] as const;
  const inputClass = 'min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700';
  return <section className="space-y-6">
    <div className="rounded-2xl bg-slate-900 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Forum management</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Admin portal</h1><p className="mt-3 text-sm leading-6 text-slate-300">Review conversations, resolve reports and manage account access. Members are identified only by their chosen usernames.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{stats.map(([label, count]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{count.toLocaleString('en-US')}</p></div>)}</div>
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">{[['reports', 'Reports'], ['posts', 'Posts'], ['comments', 'Comments'], ['accounts', 'Accounts']].map(([key, label]) => <Link key={key} href={`/admin?tab=${key}`} aria-current={tab === key ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{label}</Link>)}</nav>
    {tab === 'reports' ? <>
    <h2 className="font-semibold text-slate-900">Report review</h2>
    <p className="text-xs leading-5 text-slate-500">Latest 100 reported items. Three distinct reports automatically hide content. Restore preserves reports; dismiss clears reports without changing visibility. Restoring a comment does not restore its hidden parent post.</p>
    {!queue.items.length && <Empty>No reports to review.</Empty>}
    {queue.items.map(item => <article key={`${item.kind}-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{item.kind === 'posts' ? 'Post' : 'Comment'} · {item.hidden ? 'Hidden' : 'Visible'} · {item.reportCount} reports</p>
      {item.title && <h2 className="mt-2 break-words font-semibold">{item.title}</h2>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-indigo-600">Read reported content</summary><p className="mt-3 whitespace-pre-wrap break-words">{item.body}</p></details>
      <ul className="mt-3 list-inside list-disc text-xs text-slate-500">{item.reasons.map((reason, index) => <li key={index} className="break-words">{reason}</li>)}</ul>
      <ModerationButtons id={item.id} kind={item.kind} hidden={item.hidden} reports />
    </article>)}
    </> : <>
      <form action="/admin" method="get" className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="tab" value={tab} />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-slate-500">{tab === 'accounts' ? 'Search usernames' : 'Search content or username'}<input name="q" defaultValue={q} maxLength={tab === 'accounts' ? 20 : 150} className={inputClass} placeholder={tab === 'accounts' ? 'Username…' : 'Title, text or username…'} /></label>
        {tab !== 'accounts' && <><label className="flex flex-col gap-1.5 text-xs text-slate-500">Board<select name="board" defaultValue={board} className={inputClass}><option value="">All boards</option>{BOARDS.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label><label className="flex flex-col gap-1.5 text-xs text-slate-500">Visibility<select name="visibility" defaultValue={visibility} className={inputClass}><option value="all">All content</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label></>}
        <button type="submit" className="self-end rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">Search</button><Link href={`/admin?tab=${tab}`} className="self-end px-2 py-2.5 text-sm text-slate-500">Reset</Link>
      </form>
      {tab === 'accounts' ? <>
        <p className="text-xs leading-5 text-slate-500">Suspension blocks forum access on the next request, including existing sessions. Existing content remains for separate review. Admin roles are managed privately by the operator; admin accounts cannot be suspended here.</p>
        {!accounts.items.length && <Empty>No accounts match your search.</Empty>}
        {accounts.items.map(account => <article key={account.username} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5"><div><h2 className="break-all text-sm font-semibold text-slate-900">u/{account.username}</h2><p className="mt-1 text-xs text-slate-500">{account.isAdmin ? 'Admin' : account.suspended ? 'Suspended' : 'Active'} · Joined {new Date(account.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</p></div>{!account.isAdmin && <SuspensionButton username={account.username} suspended={account.suspended} />}</article>)}
      </> : <>
        {!content.items.length && <Empty>No {tab} match these filters.</Empty>}
        {content.items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5"><p className="break-words text-xs leading-5 text-slate-500">{item.board} · u/{item.username} · {item.hidden ? 'Hidden' : item.parentHidden ? 'Hidden by parent post' : 'Visible'} · {new Date(item.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</p><h2 className="mt-2 break-words font-semibold text-slate-900">{item.title}</h2><details className="mt-3 text-sm"><summary className="cursor-pointer text-indigo-600">Read {item.kind === 'posts' ? 'post' : 'comment'}</summary><p className="mt-3 whitespace-pre-wrap break-words text-slate-700">{item.body}</p></details>{item.parentHidden && <p className="mt-3 text-xs text-amber-700">The parent post is hidden. Restore it from Posts to make this conversation available.</p>}{!item.parentHidden && !item.hidden && <Link href={`/post/${item.postId}`} className="mt-3 inline-block text-xs text-indigo-600">Open conversation →</Link>}<ModerationButtons id={item.id} kind={item.kind} hidden={item.hidden} /></article>)}
      </>}
      <nav aria-label="Admin pagination" className="flex items-center justify-between text-sm">{page > 1 ? <Link href={pageUrl(page - 1)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-indigo-600">← Previous</Link> : <span />}<span className="text-xs text-slate-500">Page {page}</span>{hasMore && page < 10000 ? <Link href={pageUrl(page + 1)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-indigo-600">Next →</Link> : <span />}</nav>
    </>}
  </section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{children}</p>;
}
