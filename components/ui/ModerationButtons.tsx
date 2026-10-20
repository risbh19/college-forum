'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ModerationButtons({ id, kind, hidden }: { id: string; kind: 'posts' | 'comments'; hidden: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function moderate(method: 'PATCH' | 'DELETE') {
    if (method === 'DELETE' && !window.confirm('Permanently delete this content? This cannot be undone.')) return;
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/admin/${kind}/${encodeURIComponent(id)}`, {
        method, ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) } : {}),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not moderate content.');
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not moderate content.'); }
    finally { setPending(false); }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
    {!hidden && <button type="button" disabled={pending} onClick={() => moderate('PATCH')} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50">Hide</button>}
    <button type="button" disabled={pending} onClick={() => moderate('DELETE')} className="rounded bg-red-50 px-3 py-2 text-red-700 disabled:opacity-50">Delete</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </div>;
}
