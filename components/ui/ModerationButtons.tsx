'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ModerationButtons({ id, kind, hidden, reports = false }: { id: string; kind: 'posts' | 'comments'; hidden: boolean; reports?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function moderate(action: 'visibility' | 'delete' | 'dismiss') {
    if (action === 'delete' && !window.confirm(kind === 'posts' ? 'Permanently delete this post and all its comments, votes and reports? This cannot be undone.' : 'Permanently delete this comment and its reports? This cannot be undone.')) return;
    if (action === 'dismiss' && !window.confirm('Clear all reports for this item? Its visibility will stay the same. Members can report it again.')) return;
    setPending(true); setError('');
    try {
      const method = action === 'visibility' ? 'PATCH' : 'DELETE';
      const response = await fetch(`/api/admin/${action === 'dismiss' ? 'reports/' : ''}${kind}/${encodeURIComponent(id)}`, {
        method, ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: !hidden }) } : {}),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not moderate content.');
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not moderate content.'); }
    finally { setPending(false); }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
    <button type="button" disabled={pending} onClick={() => moderate('visibility')} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50">{hidden ? 'Restore' : 'Hide'}</button>
    {reports && <button type="button" disabled={pending} onClick={() => moderate('dismiss')} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50">Dismiss reports</button>}
    <button type="button" disabled={pending} onClick={() => moderate('delete')} className="rounded bg-red-50 px-3 py-2 text-red-700 disabled:opacity-50">Delete</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </div>;
}
